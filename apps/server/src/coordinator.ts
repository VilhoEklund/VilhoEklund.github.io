import {
  BlockId,
  CHUNK_SIZE,
  CLOSE_CODES,
  MAX_FRAME_BYTES,
  PLAYER_REACH,
  PLAYER_STALE_MS,
  RATE_LIMITS,
  SERVER_REACH_MARGIN,
  TerrainGenerator,
  chunkCoord,
  chunkKey,
  decodeClientFrame,
  distanceSqToBlockCenter,
  isValidWorldCoord,
  type ClientMessage,
  type ServerMessage,
  type SignInfo,
} from '@eternal-blocks/shared';
import { TokenBucket } from './ratelimit.ts';
import { WorldStore, WorldLockedError } from './store.ts';

/** Minimal socket surface used by the coordinator (works with real and fake sockets). */
export interface SocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface PositionState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

interface Buckets {
  msgs: TokenBucket;
  pos: TokenBucket;
  edits: TokenBucket;
  chat: TokenBucket;
  signs: TokenBucket;
  chunks: TokenBucket;
}

interface ConnState {
  playerId: string;
  name: string;
  lastPos: PositionState | null;
  lastPersistAt: number;
  buckets: Buckets;
  strikes: number;
  subscribedChunks: Set<string>;
}

export interface CoordinatorOptions {
  /** Chunks auto-subscribed around each player for edit broadcasts. */
  subscribeRadius?: number;
  staleMs?: number;
}

const DEFAULT_SUBSCRIBE_RADIUS = 4;

/**
 * Authoritative world coordinator.
 *
 * Owns connection state, validates every client message, applies durable
 * mutations through the {@link WorldStore} *before* broadcasting, and fans
 * out authoritative events. Deliberately framework-free so it can be driven
 * by the real Durable Object sockets or by test fakes.
 */
export class WorldCoordinator {
  readonly store: WorldStore;
  generator: TerrainGenerator | null = null;
  worldLocked: WorldLockedError | null = null;

  private readonly handlersByPlayer = new Map<string, ConnectionHandler>();
  readonly chunkSubs = new Map<string, Set<string>>();
  private readonly terrainCache = new Map<string, Uint8Array>();
  readonly subscribeRadius: number;
  private readonly staleMs: number;
  sweepCounter = 0;

  constructor(
    store: WorldStore,
    readonly now: () => number = Date.now,
    opts: CoordinatorOptions = {},
  ) {
    this.store = store;
    this.subscribeRadius = Math.max(1, opts.subscribeRadius ?? DEFAULT_SUBSCRIBE_RADIUS);
    this.staleMs = opts.staleMs ?? PLAYER_STALE_MS;
  }

  async init(seedStringOverride?: string): Promise<void> {
    let meta;
    try {
      meta = await this.store.init(seedStringOverride);
    } catch (err) {
      if (err instanceof WorldLockedError) {
        this.worldLocked = err;
        return;
      }
      throw err;
    }
    this.generator = new TerrainGenerator(meta.seed, meta.terrainVersion);
  }

  get seed(): number {
    return this.store.meta.seed;
  }

  /** Effective block at a coordinate: persisted override or generated terrain. */
  getEffectiveBlock(x: number, y: number, z: number): number {
    const override = this.store.getBlock(x, y, z);
    if (override !== null) return override;
    if (!this.generator) throw new Error('world not initialized');
    const ck = chunkKey(chunkCoord(x), chunkCoord(z));
    let data = this.terrainCache.get(ck);
    if (!data) {
      data = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * 80);
      this.generator.fillChunk(data, chunkCoord(x), chunkCoord(z));
      this.terrainCache.set(ck, data);
      if (this.terrainCache.size > 128) {
        const first = this.terrainCache.keys().next().value;
        if (first !== undefined) this.terrainCache.delete(first);
      }
    }
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return data[lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE];
  }

  spawnPoint(): { x: number; y: number; z: number } {
    return this.generator ? this.generator.findSpawn() : { x: 0.5, y: 40, z: 0.5 };
  }

  // ---------------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------------

  createHandler(socket: SocketLike): ConnectionHandler {
    return new ConnectionHandler(this, socket);
  }

  register(playerId: string, handler: ConnectionHandler): void {
    const existing = this.handlersByPlayer.get(playerId);
    if (existing && existing !== handler) {
      existing.kick(CLOSE_CODES.idle, 'replaced by a newer session');
    }
    this.handlersByPlayer.set(playerId, handler);
  }

  unregister(playerId: string, handler: ConnectionHandler): void {
    if (this.handlersByPlayer.get(playerId) !== handler) return;
    this.handlersByPlayer.delete(playerId);
    for (const [ck, set] of this.chunkSubs) {
      set.delete(playerId);
      if (set.size === 0) this.chunkSubs.delete(ck);
    }
    try {
      this.store.markOnline(playerId, 0);
    } catch {
      /* storage hiccup during shutdown must not crash the DO */
    }
    this.broadcast({ t: 'pleave', id: playerId });
  }

  onlineCount(): number {
    return this.handlersByPlayer.size;
  }

  roster(): Array<{ id: string; name: string }> {
    return this.store.rosterOnline(this.staleMs);
  }

  // ---------------------------------------------------------------------------
  // Subscriptions & fan-out
  // ---------------------------------------------------------------------------

  subscribe(handler: ConnectionHandler, cx: number, cz: number): boolean {
    const pid = handler.playerId!;
    const ck = chunkKey(cx, cz);
    const conn = handler.conn!;
    if (conn.subscribedChunks.has(ck)) return false;
    conn.subscribedChunks.add(ck);
    let set = this.chunkSubs.get(ck);
    if (!set) {
      set = new Set();
      this.chunkSubs.set(ck, set);
    }
    set.add(pid);
    return true;
  }

  sendChunkSnapshot(handler: ConnectionHandler, cx: number, cz: number): void {
    if (!this.generator) return;
    const overrides = this.store.chunkOverrides(cx, cz);
    const signs = this.store.chunkSigns(cx, cz);
    handler.send({
      t: 'chunk',
      cx,
      cz,
      overrides,
      signs,
    });
  }

  broadcast(msg: ServerMessage, exceptPlayerId?: string): void {
    for (const [pid, h] of this.handlersByPlayer) {
      if (pid === exceptPlayerId) continue;
      h.send(msg);
    }
  }

  broadcastToChunkSubscribers(chunkKeyStr: string, msg: ServerMessage): void {
    const set = this.chunkSubs.get(chunkKeyStr);
    if (!set) return;
    for (const pid of set) {
      const h = this.handlersByPlayer.get(pid);
      if (h) h.send(msg);
    }
  }

  /**
   * Periodic maintenance: drop presence for players whose sockets vanished
   * (hibernation wakeups, crashes) without a clean close.
   */
  sweep(livePlayerIds: Set<string>): void {
    this.sweepCounter++;
    const rows = this.store.rosterOnline(this.staleMs * 10);
    for (const p of rows) {
      if (!livePlayerIds.has(p.id)) {
        this.store.markOnline(p.id, 0);
        if (this.handlersByPlayer.has(p.id)) continue;
        this.broadcast({ t: 'pleave', id: p.id });
      }
    }
    if (this.sweepCounter % 20 === 0) this.store.pruneAudit();
  }
}

/**
 * Per-socket protocol handler. One instance per accepted WebSocket; rebuilt
 * lazily after Durable Object hibernation wakeups.
 */
export class ConnectionHandler {
  playerId: string | null = null;
  conn: ConnState | null = null;
  closed = false;

  constructor(
    private readonly coord: WorldCoordinator,
    private readonly socket: SocketLike,
  ) {}

  send(msg: ServerMessage): void {
    if (this.closed) return;
    try {
      this.socket.send(JSON.stringify(msg));
    } catch {
      /* recipient vanished mid-write */
    }
  }

  kick(code: number, reason: string): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.socket.close(code, reason.slice(0, 120));
    } catch {
      /* already closing */
    }
    if (this.playerId) this.coord.unregister(this.playerId, this);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.playerId) this.coord.unregister(this.playerId, this);
  }

  private sendError(code: Extract<ServerMessage, { t: 'error' }>['code'], msg: string, ref?: string): void {
    this.send(ref === undefined ? { t: 'error', code, msg } : { t: 'error', code, msg, ref });
  }

  private makeBuckets(): Buckets {
    const now = this.coord.now;
    return {
      msgs: new TokenBucket(RATE_LIMITS.messagesPerSecond, RATE_LIMITS.messagesPerSecond / 2, now),
      pos: new TokenBucket(RATE_LIMITS.posPerSecond * 2, RATE_LIMITS.posPerSecond, now),
      edits: new TokenBucket(RATE_LIMITS.editsPerSecond * 2, RATE_LIMITS.editsPerSecond, now),
      chat: new TokenBucket(RATE_LIMITS.chatPerSecond * 2, RATE_LIMITS.chatPerSecond, now),
      signs: new TokenBucket(RATE_LIMITS.signsPerSecond * 2, RATE_LIMITS.signsPerSecond, now),
      chunks: new TokenBucket(60, 30, now),
    };
  }

  private strike(n: number): void {
    if (!this.conn) return;
    this.conn.strikes += 1;
    if (this.conn.strikes >= n) this.kick(CLOSE_CODES.rateLimited, 'too many violations');
  }

  /** Number of accumulated violations (used by tests). */
  get strikes(): number {
    return this.conn?.strikes ?? 0;
  }

  /** Entry point from the DO: raw frame in, side effects + replies out. */
  async handleRawFrame(raw: string | ArrayBuffer, byteLength?: number): Promise<void> {
    if (this.closed) return;
    const size = byteLength ?? (typeof raw === 'string' ? raw.length : raw.byteLength);
    if (size > MAX_FRAME_BYTES) {
      this.kick(CLOSE_CODES.oversizedFrame, 'frame too large');
      return;
    }
    if (typeof raw !== 'string') {
      this.sendError('bad_message', 'binary frames are not accepted');
      this.strike(3);
      return;
    }
    const parsed = decodeClientFrame(raw);
    if (!parsed.ok) {
      const isJsonBroken = /^bad json/.test(parsed.error);
      this.sendError(isJsonBroken ? 'bad_json' : 'bad_message', parsed.error);
      this.strike(isJsonBroken ? 5 : 5);
      return;
    }
    if (this.conn && !this.conn.buckets.msgs.tryTake()) {
      this.sendError('rate_limited', 'slow down');
      this.strike(12);
      return;
    }
    await this.handleMessage(parsed.value as ClientMessage);
  }

  private async handleMessage(msg: ClientMessage): Promise<void> {
    switch (msg.t) {
      case 'hello':
        await this.handleHello(msg);
        return;
      case 'pos':
        this.handlePos(msg);
        return;
      case 'edit':
        await this.handleEdit(msg);
        return;
      case 'sign':
        await this.handleSign(msg);
        return;
      case 'chat':
        this.handleChat(msg);
        return;
      case 'ping':
        this.send({ t: 'pong', ts: msg.ts });
        return;
    }
  }

  private requireJoined(): boolean {
    if (!this.conn || !this.playerId) {
      this.sendError('not_joined', 'send hello first');
      return false;
    }
    return true;
  }

  private async handleHello(msg: Extract<ClientMessage, { t: 'hello' }>): Promise<void> {
    if (this.coord.worldLocked) {
      this.sendError('world_locked', 'the world was created with a different terrain generator version');
      this.closed = true;
      try {
        this.socket.close(CLOSE_CODES.protocolMismatch, 'world locked');
      } catch {
        /* ignore */
      }
      return;
    }
    const banned = this.coord.store.getPlayer(msg.playerId);
    if (banned?.banned) {
      this.sendError('banned', `you are banned: ${banned.banReason}`);
      this.kick(CLOSE_CODES.banned, 'banned');
      return;
    }
    this.playerId = msg.playerId;
    this.conn = {
      playerId: msg.playerId,
      name: msg.name,
      lastPos:
        (() => {
          const lp = this.coord.store.lastKnownPosition(msg.playerId);
          return lp ? { ...lp, yaw: 0, pitch: 0 } : null;
        })(),
      lastPersistAt: 0,
      buckets: this.makeBuckets(),
      strikes: 0,
      subscribedChunks: new Set(),
    };
    // Register first so a reconnecting session replaces (kicks) the old one
    // before presence flips online again.
    this.coord.register(msg.playerId, this);
    this.coord.store.recordJoin(msg.playerId, msg.name);

    const others = this.coord.roster().filter((p) => p.id !== msg.playerId);
    this.send({
      t: 'welcome',
      proto: 1,
      playerId: msg.playerId,
      seed: this.coord.seed,
      terrainVersion: this.coord.store.meta.terrainVersion,
      spawn: this.coord.spawnPoint(),
      players: others,
      serverTime: Date.now(),
    });

    // Initial sync around the spawn/last position.
    const start = this.conn.lastPos ?? this.coord.spawnPoint();
    this.syncArea(Math.floor(start.x) >> 4, Math.floor(start.z) >> 4);

    this.coord.broadcast({ t: 'pjoin', id: msg.playerId, name: msg.name }, msg.playerId);
  }

  /** Subscribe to the radius around a chunk center and push snapshots. */
  private syncArea(cx: number, cz: number): void {
    if (!this.conn) return;
    const r = this.coord.subscribeRadius;
    const fresh: Array<[number, number]> = [];
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const ccx = cx + dx;
        const ccz = cz + dz;
        if (this.coord.subscribe(this, ccx, ccz)) fresh.push([ccx, ccz]);
      }
    }
    if (fresh.length > 0) {
      this.send({ t: 'syncStart', chunks: fresh });
      for (const [ax, az] of fresh) this.coord.sendChunkSnapshot(this, ax, az);
      this.send({ t: 'syncDone' });
    }
  }

  private handlePos(msg: Extract<ClientMessage, { t: 'pos' }>): void {
    if (!this.requireJoined()) return;
    const conn = this.conn!;
    if (!conn.buckets.pos.tryTake()) return; // silently drop excess movement spam
    conn.lastPos = { x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, pitch: msg.pitch };
    const now = this.coord.now();
    if (now - conn.lastPersistAt > 20_000) {
      conn.lastPersistAt = now;
      try {
        this.coord.store.persistPosition(conn.playerId, msg.x, msg.y, msg.z);
      } catch {
        /* non-critical */
      }
    }
    // Keep subscriptions centered on the player.
    const pcx = Math.floor(msg.x) >> 4;
    const pcz = Math.floor(msg.z) >> 4;
    const r = this.coord.subscribeRadius;
    const wanted = new Set<string>();
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) wanted.add(chunkKey(pcx + dx, pcz + dz));
    }
    let driftedFar = false;
    for (const ck of conn.subscribedChunks) {
      if (!wanted.has(ck)) {
        driftedFar = true;
        break;
      }
    }
    if (driftedFar) {
      for (const ck of conn.subscribedChunks) {
        if (!wanted.has(ck)) {
          const set = this.coord.chunkSubs.get(ck);
          if (set) {
            set.delete(conn.playerId);
            if (set.size === 0) this.coord.chunkSubs.delete(ck);
          }
          conn.subscribedChunks.delete(ck);
        }
      }
      this.syncArea(pcx, pcz);
    }
    this.coord.broadcast(
      {
        t: 'ps',
        id: conn.playerId,
        x: msg.x,
        y: msg.y,
        z: msg.z,
        yaw: msg.yaw,
        pitch: msg.pitch,
      },
      conn.playerId,
    );
  }

  private validateReach(x: number, y: number, z: number): boolean {
    const pos = this.conn!.lastPos;
    if (!pos) {
      this.sendError('unreachable', 'position unknown; move before editing');
      return false;
    }
    const limit = (PLAYER_REACH + SERVER_REACH_MARGIN) ** 2;
    if (distanceSqToBlockCenter(pos.x, pos.y + 1.62, pos.z, x, y, z) > limit) {
      this.sendError('unreachable', 'target out of reach');
      return false;
    }
    return true;
  }

  private async handleEdit(msg: Extract<ClientMessage, { t: 'edit' }>): Promise<void> {
    if (!this.requireJoined()) return;
    const conn = this.conn!;
    if (!conn.buckets.edits.tryTake()) {
      this.sendError('rate_limited', 'too many edits', msg.eid);
      this.strike(6);
      return;
    }
    if (!isValidWorldCoord(msg.x, msg.y, msg.z)) {
      this.sendError('out_of_range', 'coordinates out of range', msg.eid);
      return;
    }
    // Idempotent retry (e.g., after reconnect): acknowledge the stored result
    // without re-validating world state and without re-broadcasting.
    if (this.coord.store.hasEdit(msg.eid)) {
      const stored = this.coord.store.getBlock(msg.x, msg.y, msg.z) ?? BlockId.Air;
      this.send({
        t: 'blockApplied',
        eid: msg.eid,
        action: msg.action,
        x: msg.x,
        y: msg.y,
        z: msg.z,
        block: stored,
        by: { id: conn.playerId, name: conn.name },
      });
      return;
    }
    if (!this.validateReach(msg.x, msg.y, msg.z)) return;

    const current = this.coord.getEffectiveBlock(msg.x, msg.y, msg.z);
    let newBlock: number;
    if (msg.action === 'break') {
      if (current === BlockId.Air || current === BlockId.Water || current === null) {
        this.sendError('nothing_to_edit', 'nothing to break here', msg.eid);
        return;
      }
      if (current === BlockId.Bedrock) {
        this.sendError('unbreakable', 'bedrock cannot be broken', msg.eid);
        return;
      }
      newBlock = BlockId.Air;
    } else {
      if (current !== BlockId.Air && current !== BlockId.Water) {
        this.sendError('nothing_to_edit', 'cell is occupied', msg.eid);
        return;
      }
      newBlock = msg.block!;
    }

    const result = await this.coord.store.applyBlock({
      eid: msg.eid,
      x: msg.x,
      y: msg.y,
      z: msg.z,
      block: newBlock,
      actorId: conn.playerId,
      actorName: conn.name,
      cascadeSignRemove: msg.action === 'break' && current === BlockId.Sign,
    });

    if (result.duplicate) {
      // Idempotent retry: re-acknowledge the stored result without re-broadcasting.
      const stored = this.coord.store.getBlock(msg.x, msg.y, msg.z);
      this.send({
        t: 'blockApplied',
        eid: msg.eid,
        action: msg.action,
        x: msg.x,
        y: msg.y,
        z: msg.z,
        block: stored ?? newBlock,
        by: { id: conn.playerId, name: conn.name },
      });
      return;
    }

    const applied: Extract<ServerMessage, { t: 'blockApplied' }> = {
      t: 'blockApplied',
      eid: msg.eid,
      action: msg.action,
      x: msg.x,
      y: msg.y,
      z: msg.z,
      block: newBlock,
      by: { id: conn.playerId!, name: conn.name },
    };
    // Persisted before this broadcast (store.applyBlock committed above).
    this.coord.broadcastToChunkSubscribers(chunkKey(chunkCoord(msg.x), chunkCoord(msg.z)), applied);
    if (result.signRemoved) {
      const signMsg: Extract<ServerMessage, { t: 'signApplied' }> = {
        t: 'signApplied',
        eid: `${msg.eid}:cascade`,
        op: 'remove',
        sign: { x: msg.x, y: msg.y, z: msg.z, text: '', authorId: '', authorName: '', updatedAt: 0 },
      };
      this.coord.broadcastToChunkSubscribers(chunkKey(chunkCoord(msg.x), chunkCoord(msg.z)), signMsg);
    }
  }

  private async handleSign(msg: Extract<ClientMessage, { t: 'sign' }>): Promise<void> {
    if (!this.requireJoined()) return;
    const conn = this.conn!;
    if (!conn.buckets.signs.tryTake()) {
      this.sendError('rate_limited', 'too many sign operations', msg.eid);
      this.strike(6);
      return;
    }
    if (!isValidWorldCoord(msg.x, msg.y, msg.z)) {
      this.sendError('out_of_range', 'coordinates out of range', msg.eid);
      return;
    }
    // Idempotent retry for sign operations.
    if (this.coord.store.hasEdit(msg.eid)) {
      const stored = this.coord.store.getSign(msg.x, msg.y, msg.z);
      this.send({ t: 'signApplied', eid: msg.eid, op: msg.op, sign: stored ?? placeholderSign(msg, conn) });
      return;
    }
    if (!this.validateReach(msg.x, msg.y, msg.z)) return;
    const existing = this.coord.store.getSign(msg.x, msg.y, msg.z);
    if (msg.op === 'update' || msg.op === 'remove') {
      if (!existing) {
        this.sendError('sign_not_found', 'no sign at that location', msg.eid);
        return;
      }
      if (existing.authorId !== conn.playerId) {
        this.sendError('sign_forbidden', 'only the author can modify a sign', msg.eid);
        return;
      }
    }

    const text = msg.op === 'remove' ? '' : (msg.text ?? '');
    const result = await this.coord.store.applySign({
      eid: msg.eid,
      op: msg.op,
      x: msg.x,
      y: msg.y,
      z: msg.z,
      text,
      rot: msg.rot,
      actorId: conn.playerId!,
      actorName: conn.name,
    });

    if (result.duplicate) {
      const stored = this.coord.store.getSign(msg.x, msg.y, msg.z);
      this.send({ t: 'signApplied', eid: msg.eid, op: msg.op, sign: stored ?? placeholderSign(msg, conn) });
      return;
    }

    const sign: SignInfo =
      msg.op === 'remove'
        ? { x: msg.x, y: msg.y, z: msg.z, text: '', authorId: existing?.authorId ?? '', authorName: '', updatedAt: 0 }
        : (this.coord.store.getSign(msg.x, msg.y, msg.z) ?? placeholderSign(msg, conn));

    const out: Extract<ServerMessage, { t: 'signApplied' }> = {
      t: 'signApplied',
      eid: msg.eid,
      op: msg.op,
      sign,
    };
    this.coord.broadcastToChunkSubscribers(chunkKey(chunkCoord(msg.x), chunkCoord(msg.z)), out);
  }

  private handleChat(msg: Extract<ClientMessage, { t: 'chat' }>): void {
    if (!this.requireJoined()) return;
    const conn = this.conn!;
    if (!conn.buckets.chat.tryTake()) {
      this.sendError('rate_limited', 'chat slower please');
      this.strike(6);
      return;
    }
    this.coord.broadcast({
      t: 'chatMsg',
      from: { id: conn.playerId!, name: conn.name },
      text: msg.text,
      ts: Date.now(),
    });
  }
}

function placeholderSign(
  msg: { x: number; y: number; z: number },
  conn: ConnState,
): SignInfo {
  return {
    x: msg.x,
    y: msg.y,
    z: msg.z,
    text: '',
    authorId: conn.playerId,
    authorName: conn.name,
    updatedAt: 0,
  };
}

// Re-export for DO wiring convenience.
export { WorldLockedError };

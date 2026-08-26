import { AUDIT_MAX_ROWS, DEFAULT_SEED_STRING, TERRAIN_VERSION, WORLD_HEIGHT } from '@eternal-blocks/shared';
import { blockIndex, chunkCoord } from '@eternal-blocks/shared';
import type { SignInfo } from '@eternal-blocks/shared';
import type { SqlAdapter } from './adapters.ts';

/** Thrown when the persisted world was generated with a different generator. */
export class WorldLockedError extends Error {
  constructor(
    message: string,
    readonly persistedVersion: number,
  ) {
    super(message);
  }
}

export interface WorldMeta {
  seed: number;
  seedString: string;
  terrainVersion: number;
  createdAt: number;
}

export interface BlockRow {
  x: number;
  y: number;
  z: number;
  block: number;
  updatedAt: number;
}

export interface ApplyResult {
  duplicate: boolean;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS blocks (
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  z INTEGER NOT NULL,
  cx INTEGER NOT NULL,
  cz INTEGER NOT NULL,
  block INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (x, y, z)
);
CREATE INDEX IF NOT EXISTS idx_blocks_chunk ON blocks (cx, cz);
CREATE TABLE IF NOT EXISTS signs (
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  z INTEGER NOT NULL,
  cx INTEGER NOT NULL,
  cz INTEGER NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL DEFAULT '',
  rot INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (x, y, z)
);
CREATE INDEX IF NOT EXISTS idx_signs_chunk ON signs (cx, cz);
CREATE TABLE IF NOT EXISTS edits (
  eid TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  online INTEGER NOT NULL DEFAULT 0,
  last_x REAL,
  last_y REAL,
  last_z REAL,
  banned INTEGER NOT NULL DEFAULT 0,
  ban_reason TEXT NOT NULL DEFAULT ''
);
`;

/**
 * Durable world storage. All player-created state lives here:
 * block overrides, signs, the edit-id idempotency table, an audit log,
 * and player/ban metadata. Terrain itself is never stored - it is
 * regenerated deterministically from the seed.
 */
export class WorldStore {
  private metaCache: WorldMeta | null = null;

  constructor(
    private readonly sql: SqlAdapter,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async init(seedStringOverride?: string): Promise<WorldMeta> {
    for (const stmt of SCHEMA.split(';')) {
      const trimmed = stmt.trim();
      if (trimmed.length > 0) this.sql.run(trimmed);
    }
    const rows = this.sql.all<{ key: string; value: string }>(
      `SELECT key, value FROM meta WHERE key IN ('seed','seedString','terrainVersion','createdAt')`,
    );
    const map = new Map(rows.map((r) => [r.key, r.value]));
    let meta = this.metaFromRows(map);
    if (!meta) {
      const seedString =
        seedStringOverride && seedStringOverride.trim().length > 0 ? seedStringOverride : DEFAULT_SEED_STRING;
      // Seed is derived from a string so it is reproducible from documentation alone.
      const fresh: WorldMeta = {
        seed: hashSeedString(seedString),
        seedString,
        terrainVersion: TERRAIN_VERSION,
        createdAt: this.now(),
      };
      await this.sql.transaction(() => {
        this.sql.run(`INSERT INTO meta(key,value) VALUES('seed',?)`, String(fresh.seed));
        this.sql.run(`INSERT INTO meta(key,value) VALUES('seedString',?)`, fresh.seedString);
        this.sql.run(`INSERT INTO meta(key,value) VALUES('terrainVersion',?)`, String(fresh.terrainVersion));
        this.sql.run(`INSERT INTO meta(key,value) VALUES('createdAt',?)`, String(fresh.createdAt));
      });
      this.audit('system', 'world-init', JSON.stringify({ seed: fresh.seed, terrainVersion: fresh.terrainVersion }));
      meta = fresh;
    } else if (meta.terrainVersion !== TERRAIN_VERSION) {
      // Never silently regenerate the world on top of persisted edits.
      throw new WorldLockedError(
        `world was created with terrain version ${meta.terrainVersion}, server runs ${TERRAIN_VERSION}`,
        meta.terrainVersion,
      );
    }
    this.metaCache = meta;
    return meta;
  }

  get meta(): WorldMeta {
    if (!this.metaCache) throw new Error('world not initialized');
    return this.metaCache;
  }

  private metaFromRows(map: Map<string, string>): WorldMeta | null {
    const seed = map.get('seed');
    const ver = map.get('terrainVersion');
    if (seed === undefined || ver === undefined) return null;
    return {
      seed: Number(seed),
      seedString: map.get('seedString') ?? '',
      terrainVersion: Number(ver),
      createdAt: Number(map.get('createdAt') ?? 0),
    };
  }

  // ---------------------------------------------------------------------------
  // Blocks
  // ---------------------------------------------------------------------------

  getBlock(x: number, y: number, z: number): number | null {
    const rows = this.sql.all<{ block: number }>(`SELECT block FROM blocks WHERE x=? AND y=? AND z=?`, x, y, z);
    return rows.length > 0 ? rows[0].block : null;
  }

  /**
   * Persist a block mutation atomically with its idempotency marker.
   * Retrying an already-applied edit id is a no-op that reports duplicate.
   * When the previous cell held a sign and `cascadeSignRemove` is set, the
   * sign row is deleted in the same transaction.
   */
  async applyBlock(args: {
    eid: string;
    x: number;
    y: number;
    z: number;
    block: number;
    actorId: string;
    actorName: string;
    cascadeSignRemove?: boolean;
  }): Promise<ApplyResult & { signRemoved: boolean }> {
    const at = this.now();
    let duplicate = false;
    let signRemoved = false;
    await this.sql.transaction(() => {
      const ins = this.sql.run(
        `INSERT INTO edits(eid,kind,at) VALUES(?,'block',?) ON CONFLICT(eid) DO NOTHING`,
        args.eid,
        at,
      );
      if (ins.changes === 0) {
        duplicate = true;
        return;
      }
      const prev = this.getBlock(args.x, args.y, args.z);
      const hadSignBlock = prev === 13; // BlockId.Sign (numeric literal avoids circular import)
      this.sql.run(
        `INSERT INTO blocks(x,y,z,cx,cz,block,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?)
         ON CONFLICT(x,y,z) DO UPDATE SET block=excluded.block, updated_at=excluded.updated_at, updated_by=excluded.updated_by`,
        args.x,
        args.y,
        args.z,
        chunkCoord(args.x),
        chunkCoord(args.z),
        args.block,
        at,
        args.actorId,
      );
      if (hadSignBlock && args.cascadeSignRemove) {
        this.sql.run(`DELETE FROM signs WHERE x=? AND y=? AND z=?`, args.x, args.y, args.z);
        signRemoved = true;
        this.appendAuditUnsafe(args.actorId, args.actorName, 'sign:remove', {
          eid: `${args.eid}:cascade`,
          x: args.x,
          y: args.y,
          z: args.z,
          chars: 0,
        });
      }
      this.appendAuditUnsafe(args.actorId, args.actorName, 'block', {
        eid: args.eid,
        x: args.x,
        y: args.y,
        z: args.z,
        block: args.block,
      });
    });
    return { duplicate, signRemoved };
  }

  /** Whether this edit id has already been applied (idempotency check). */
  hasEdit(eid: string): boolean {
    return this.sql.all(`SELECT eid FROM edits WHERE eid=?`, eid).length > 0;
  }

  /** Override rows for one chunk as [flatIndex, blockId] pairs. */
  chunkOverrides(cx: number, cz: number): Array<[number, number]> {
    const rows = this.sql.all<{ x: number; y: number; z: number; block: number }>(
      `SELECT x,y,z,block FROM blocks WHERE cx=? AND cz=?`,
      cx,
      cz,
    );
    return rows.map((r) => [blockIndex(((r.x % 16) + 16) % 16, r.y, ((r.z % 16) + 16) % 16), r.block] as [number, number]);
  }

  allBlocks(): BlockRow[] {
    return this.sql.all<BlockRow & { updated_at: number }>(
      `SELECT x,y,z,block,updated_at FROM blocks ORDER BY updated_at ASC`,
    ).map((r) => ({ x: r.x, y: r.y, z: r.z, block: r.block, updatedAt: r.updated_at }));
  }

  auditCount(): number {
    const rows = this.sql.all<{ n: number }>(`SELECT COUNT(*) AS n FROM audit`);
    return Number(rows[0]?.n ?? 0);
  }

  pruneAudit(maxRows: number = AUDIT_MAX_ROWS): void {
    this.sql.run(
      `DELETE FROM audit WHERE seq <= ((SELECT COALESCE(MAX(seq),0) FROM audit) - ?)`,
      maxRows,
    );
  }

  // ---------------------------------------------------------------------------
  // Signs
  // ---------------------------------------------------------------------------

  getSign(x: number, y: number, z: number): SignInfo | null {
    const rows = this.sql.all<{
      x: number;
      y: number;
      z: number;
      text: string;
      author_id: string;
      author_name: string;
      rot: number;
      created_at: number;
      updated_at: number;
    }>(
      `SELECT x,y,z,text,author_id,author_name,rot,created_at,updated_at FROM signs WHERE x=? AND y=? AND z=?`,
      x,
      y,
      z,
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      x: r.x,
      y: r.y,
      z: r.z,
      text: r.text,
      authorId: r.author_id,
      authorName: r.author_name,
      updatedAt: r.updated_at,
      rot: r.rot,
    };
  }

  async applySign(args: {
    eid: string;
    op: 'create' | 'update' | 'remove';
    x: number;
    y: number;
    z: number;
    text: string;
    rot?: number;
    actorId: string;
    actorName: string;
  }): Promise<ApplyResult> {
    const at = this.now();
    let duplicate = false;
    await this.sql.transaction(() => {
      const kind = `sign:${args.op}`;
      const ins = this.sql.run(`INSERT INTO edits(eid,kind,at) VALUES(?,?,?) ON CONFLICT(eid) DO NOTHING`, args.eid, kind, at);
      if (ins.changes === 0) {
        duplicate = true;
        return;
      }
      if (args.op === 'remove') {
        this.sql.run(`DELETE FROM signs WHERE x=? AND y=? AND z=?`, args.x, args.y, args.z);
      } else {
        const existingRot = this.sql.all<{ rot: number }>(
          `SELECT rot FROM signs WHERE x=? AND y=? AND z=?`,
          args.x,
          args.y,
          args.z,
        );
        // Rotation is chosen at creation and immutable afterwards.
        const rot = existingRot.length > 0 ? existingRot[0].rot : Math.max(0, Math.min(3, args.rot ?? 0));
        this.sql.run(
          `INSERT INTO signs(x,y,z,cx,cz,text,author_id,author_name,rot,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(x,y,z) DO UPDATE SET text=excluded.text, updated_at=excluded.updated_at`,
          args.x,
          args.y,
          args.z,
          chunkCoord(args.x),
          chunkCoord(args.z),
          args.text,
          args.actorId,
          args.actorName,
          rot,
          at,
          at,
        );
      }
      this.appendAuditUnsafe(args.actorId, args.actorName, kind, {
        eid: args.eid,
        x: args.x,
        y: args.y,
        z: args.z,
        chars: args.text.length,
      });
    });
    return { duplicate };
  }

  chunkSigns(cx: number, cz: number): SignInfo[] {
    const rows = this.sql.all<{
      x: number;
      y: number;
      z: number;
      text: string;
      author_id: string;
      author_name: string;
      rot: number;
      updated_at: number;
    }>(`SELECT x,y,z,text,author_id,author_name,rot,updated_at FROM signs WHERE cx=? AND cz=?`, cx, cz);
    return rows.map((r) => ({
      x: r.x,
      y: r.y,
      z: r.z,
      text: r.text,
      authorId: r.author_id,
      authorName: r.author_name,
      updatedAt: r.updated_at,
      rot: r.rot,
    }));
  }

  allSigns(): SignInfo[] {
    return this.sql
      .all<{
        x: number;
        y: number;
        z: number;
        text: string;
        author_id: string;
        author_name: string;
        rot: number;
        updated_at: number;
      }>(`SELECT x,y,z,text,author_id,author_name,rot,updated_at FROM signs ORDER BY updated_at ASC`)
      .map((r) => ({
        x: r.x,
        y: r.y,
        z: r.z,
        text: r.text,
        authorId: r.author_id,
        authorName: r.author_name,
        updatedAt: r.updated_at,
        rot: r.rot,
      }));
  }

  // ---------------------------------------------------------------------------
  // Players / presence / moderation
  // ---------------------------------------------------------------------------

  getPlayer(id: string): { id: string; name: string; banned: boolean; banReason: string; lastX: number | null } | null {
    const rows = this.sql.all<{
      id: string;
      name: string;
      banned: number;
      ban_reason: string;
      last_x: number | null;
    }>(`SELECT id,name,banned,ban_reason,last_x FROM players WHERE id=?`, id);
    if (rows.length === 0) return null;
    const r = rows[0];
    return { id: r.id, name: r.name, banned: r.banned === 1, banReason: r.ban_reason, lastX: r.last_x };
  }

  recordJoin(id: string, name: string): void {
    const at = this.now();
    this.sql.run(
      `INSERT INTO players(id,name,first_seen,last_seen,online) VALUES(?,?,?,?,1)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, last_seen=excluded.last_seen, online=1`,
      id,
      name,
      at,
      at,
    );
  }

  markOnline(id: string, online: 0 | 1): void {
    this.sql.run(`UPDATE players SET online=?, last_seen=? WHERE id=?`, online, this.now(), id);
  }

  persistPosition(id: string, x: number, y: number, z: number): void {
    this.sql.run(
      `UPDATE players SET last_x=?, last_y=?, last_z=?, last_seen=? WHERE id=?`,
      x,
      y,
      z,
      this.now(),
      id,
    );
  }

  lastKnownPosition(id: string): { x: number; y: number; z: number } | null {
    const rows = this.sql.all<{ last_x: number | null; last_y: number | null; last_z: number | null }>(
      `SELECT last_x,last_y,last_z FROM players WHERE id=?`,
      id,
    );
    const r = rows[0];
    if (!r || r.last_x === null || r.last_y === null || r.last_z === null) return null;
    return { x: r.last_x, y: r.last_y, z: r.last_z };
  }

  rosterOnline(staleMs: number): Array<{ id: string; name: string }> {
    const cutoff = this.now() - staleMs;
    return this.sql
      .all<{ id: string; name: string }>(
        `SELECT id,name FROM players WHERE online=1 AND last_seen > ?`,
        cutoff,
      )
      .map((r) => ({ id: r.id, name: r.name }));
  }

  setBan(id: string, reason: string, byAdmin: string): boolean {
    const res = this.sql.run(`UPDATE players SET banned=1, ban_reason=? WHERE id=?`, `${reason} (by ${byAdmin})`, id);
    this.audit('admin', 'ban', JSON.stringify({ playerId: id, reason }));
    return res.changes > 0;
  }

  clearBan(id: string, byAdmin: string): boolean {
    const res = this.sql.run(`UPDATE players SET banned=0, ban_reason='' WHERE id=?`, id);
    this.audit('admin', 'unban', JSON.stringify({ playerId: id, admin: byAdmin }));
    return res.changes > 0;
  }

  listBans(): Array<{ id: string; reason: string }> {
    return this.sql
      .all<{ id: string; ban_reason: string }>(`SELECT id,ban_reason FROM players WHERE banned=1`)
      .map((r) => ({ id: r.id, reason: r.ban_reason }));
  }

  // ---------------------------------------------------------------------------
  // Audit + export/import
  // ---------------------------------------------------------------------------

  audit(actorId: string, kind: string, payloadJson: string): void {
    this.appendAuditUnsafe(actorId, '', kind, JSON.parse(payloadJson) as unknown);
    if (this.auditCount() > AUDIT_MAX_ROWS * 1.05) this.pruneAudit();
  }

  private appendAuditUnsafe(actorId: string, actorName: string, kind: string, payload: unknown): void {
    this.sql.run(
      `INSERT INTO audit(at,actor_id,actor_name,kind,payload) VALUES(?,?,?,?,?)`,
      this.now(),
      actorId,
      actorName,
      kind,
      JSON.stringify(payload),
    );
  }

  exportAll(): {
    format: string;
    exportedAt: number;
    meta: WorldMeta;
    blocks: BlockRow[];
    signs: SignInfo[];
    bans: Array<{ id: string; reason: string }>;
    auditTail: Array<{ at: number; actorId: string; kind: string; payload: string }>;
  } {
    return {
      format: 'eternal-blocks/world-export@1',
      exportedAt: this.now(),
      meta: this.meta,
      blocks: this.allBlocks(),
      signs: this.allSigns(),
      bans: this.listBans(),
      auditTail: this.sql
        .all<{ at: number; actor_id: string; kind: string; payload: string }>(
          `SELECT at,actor_id,kind,payload FROM audit ORDER BY seq DESC LIMIT 1000`,
        )
        .map((r) => ({ at: r.at, actorId: r.actor_id, kind: r.kind, payload: r.payload })),
    };
  }

  /**
   * Merge-only restore path. Never overwrites the persisted seed; incoming
   * rows win only when newer than stored rows.
   */
  async importMerge(data: {
    meta?: { seed?: number; seedString?: string; terrainVersion?: number };
    blocks?: BlockRow[];
    signs?: Array<SignInfo>;
    auditNote?: string;
  }): Promise<{ blocksMerged: number; signsMerged: number }> {
    if (data.meta && typeof data.meta.seed === 'number' && data.meta.seed !== this.meta.seed) {
      throw new WorldLockedError('import rejected: seed mismatch (refusing to replace the world)', this.meta.terrainVersion);
    }
    if (data.meta?.terrainVersion !== undefined && data.meta.terrainVersion !== TERRAIN_VERSION) {
      throw new WorldLockedError('import rejected: terrain version mismatch', this.meta.terrainVersion);
    }
    let blocksMerged = 0;
    let signsMerged = 0;
    await this.sql.transaction(() => {
      for (const b of data.blocks ?? []) {
        if (!Number.isInteger(b.x) || !Number.isInteger(b.y) || !Number.isInteger(b.z)) continue;
        if (b.y < 0 || b.y >= WORLD_HEIGHT || !Number.isInteger(b.block)) continue;
        this.sql.run(
          `INSERT INTO blocks(x,y,z,cx,cz,block,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,'import')
           ON CONFLICT(x,y,z) DO UPDATE SET
             block=CASE WHEN excluded.updated_at > blocks.updated_at THEN excluded.block ELSE blocks.block END,
             updated_at=CASE WHEN excluded.updated_at > blocks.updated_at THEN excluded.updated_at ELSE blocks.updated_at END`,
          b.x,
          b.y,
          b.z,
          chunkCoord(b.x),
          chunkCoord(b.z),
          b.block,
          b.updatedAt ?? this.now(),
        );
        blocksMerged++;
      }
      for (const s of data.signs ?? []) {
        if (!Number.isInteger(s.x) || !Number.isInteger(s.y) || !Number.isInteger(s.z)) continue;
        if (s.y < 0 || s.y >= WORLD_HEIGHT) continue;
        this.sql.run(
          `INSERT INTO signs(x,y,z,cx,cz,text,author_id,author_name,rot,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(x,y,z) DO UPDATE SET
             text=CASE WHEN excluded.updated_at > signs.updated_at THEN excluded.text ELSE signs.text END,
             updated_at=CASE WHEN excluded.updated_at > signs.updated_at THEN excluded.updated_at ELSE signs.updated_at END`,
          s.x,
          s.y,
          s.z,
          chunkCoord(s.x),
          chunkCoord(s.z),
          String(s.text ?? ''),
          String(s.authorId ?? ''),
          String(s.authorName ?? ''),
          Math.max(0, Math.min(3, s.rot ?? 0)),
          s.updatedAt ?? this.now(),
          s.updatedAt ?? this.now(),
        );
        signsMerged++;
      }
      this.audit('system', 'import', JSON.stringify({ note: data.auditNote ?? '', blocksMerged, signsMerged }));
    });
    return { blocksMerged, signsMerged };
  }
}

/** FNV-1a string hash matching packages/shared hashString (kept dependency-free here). */
function hashSeedString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

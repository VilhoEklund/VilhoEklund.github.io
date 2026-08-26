import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CLOSE_CODES, PLAYER_REACH, SERVER_REACH_MARGIN } from '@eternal-blocks/shared';
import { WorldCoordinator } from '../src/coordinator.ts';
import { WorldStore } from '../src/store.ts';
import { FakeSql, TestPlayer, makeWorld, testId } from './harness.ts';

let eidCounter = 0;
function nextEid(): string {
  return `eid${String(++eidCounter).padStart(10, '0')}`;
}

/** Find a cell above ground at the spawn column that is air and within reach. */
function findAirCellNearSpawn(coord: WorldCoordinator): { x: number; y: number; z: number } {
  const sp = coord.spawnPoint();
  const px = Math.floor(sp.x);
  const py = Math.floor(sp.y);
  const pz = Math.floor(sp.z);
  for (let dy = 1; dy <= 5; dy++) {
    if (coord.getEffectiveBlock(px, py + dy, pz) === 0) return { x: px, y: py + dy, z: pz };
  }
  throw new Error('no reachable air cell found near spawn');
}

describe('presence', () => {
  it('two clients join the same world and see each other', async () => {
    const { coord } = await makeWorld();
    const alice = new TestPlayer(coord, testId(), 'Alice');
    const bob = new TestPlayer(coord, testId(), 'Bob');
    await alice.connect();
    await bob.connect();

    expect(alice.welcome?.players).toEqual([]);
    const bobRoster = bob.welcome!.players;
    expect(bobRoster.map((p) => p.name)).toContain('Alice');
    expect(alice.socket.ofType('pjoin').map((m) => m.name)).toContain('Bob');

    // Same world seed for everyone.
    expect(bob.welcome!.seed).toBe(alice.welcome!.seed);
  });

  it('announces leave and stops presence on disconnect', async () => {
    const { coord } = await makeWorld();
    const alice = new TestPlayer(coord, testId(), 'Alice');
    const bob = new TestPlayer(coord, testId(), 'Bob');
    await alice.connect();
    await bob.connect();
    bob.disconnect();
    expect(alice.socket.ofType('pleave').map((m) => m.id)).toContain(bob.playerId);
  });

  it('replacing a session (reconnect) kicks the older socket', async () => {
    const { coord } = await makeWorld();
    const pid = testId();
    const first = new TestPlayer(coord, pid, 'Reconnector');
    await first.connect();
    const second = new TestPlayer(coord, pid, 'Reconnector');
    await second.connect();
    expect(first.socket.closed).toBe(true);
    expect(second.socket.closed).toBe(false);
  });
});

describe('block edits', () => {
  it('applies, persists and broadcasts a placement to subscribers', async () => {
    const { coord, store } = await makeWorld();
    const alice = new TestPlayer(coord, testId(), 'Alice');
    const bob = new TestPlayer(coord, testId(), 'Bob');
    await alice.connect();
    await bob.connect();

    const sp = coord.spawnPoint();
    const bx = Math.floor(sp.x) + 2;
    const by = Math.floor(sp.y) + 2;
    const bz = Math.floor(sp.z);

    const eid = nextEid();
    await alice.send({ t: 'edit', eid, action: 'place', x: bx, y: by, z: bz, block: 9 });

    const applied = bob.socket.ofType('blockApplied');
    expect(applied.length).toBe(1);
    expect(applied[0]).toMatchObject({ eid, action: 'place', x: bx, y: by, z: bz, block: 9 });
    // Persisted before broadcast.
    expect(store.getBlock(bx, by, bz)).toBe(9);
    // Sender got its ack too.
    expect(alice.socket.ofType('blockApplied').length).toBe(1);
  });

  it('rejects occupied edits with typed errors', async () => {
    const { coord } = await makeWorld();
    const alice = new TestPlayer(coord, testId(), 'Alice');
    await alice.connect();

    const sp = coord.spawnPoint();
    // Terrain surface cell is solid -> not replaceable.
    await alice.send({
      t: 'edit',
      eid: nextEid(),
      action: 'place',
      x: Math.floor(sp.x),
      y: Math.floor(sp.y) - 1,
      z: Math.floor(sp.z),
      block: 3,
    });
    expect((alice.socket.last() as { code: string }).code).toBe('nothing_to_edit');
  });

  it('rejects unreachable edits (distance validation)', async () => {
    const { coord } = await makeWorld();
    const alice = new TestPlayer(coord, testId(), 'Sniper');
    await alice.connect();
    const sp = coord.spawnPoint();
    const farBlocks = Math.ceil(PLAYER_REACH + SERVER_REACH_MARGIN + 5);
    await alice.send({
      t: 'edit',
      eid: nextEid(),
      action: 'place',
      x: Math.floor(sp.x) + farBlocks,
      y: Math.floor(sp.y),
      z: Math.floor(sp.z),
      block: 3,
    });
    const last = alice.socket.last() as { t: string; code?: string };
    expect(last.t).toBe('error');
    expect(last.code).toBe('unreachable');
  });

  it('protects bedrock and refuses breaking air', async () => {
    const { coord } = await makeWorld();
    const alice = new TestPlayer(coord, testId(), 'Miner');
    await alice.connect();
    const sp = coord.spawnPoint();

    // Report an implausible-but-bounded position next to bedrock; the server
    // validates geometry/reach, not full physics simulation.
    await alice.send({ t: 'pos', x: sp.x, y: 1.0, z: sp.z, yaw: 0, pitch: 0 });
    await alice.send({ t: 'edit', eid: nextEid(), action: 'break', x: Math.floor(sp.x), y: 0, z: Math.floor(sp.z) });
    expect((alice.socket.last() as { code: string }).code).toBe('unbreakable');

    // Back to spawn; break a known air cell within reach.
    await alice.send({ t: 'pos', x: sp.x, y: sp.y, z: sp.z, yaw: 0, pitch: 0 });
    const air = findAirCellNearSpawn(coord);
    await alice.send({ t: 'edit', eid: nextEid(), action: 'break', ...air });
    expect((alice.socket.last() as { code: string }).code).toBe('nothing_to_edit');
  });

  it('is idempotent when an edit id is retried after reconnect', async () => {
    const { coord, store } = await makeWorld();
    const alice = new TestPlayer(coord, testId(), 'Alice');
    const bob = new TestPlayer(coord, testId(), 'Bob');
    await alice.connect();
    await bob.connect();

    const sp = coord.spawnPoint();
    const msg = {
      t: 'edit' as const,
      eid: 'retry-edit-0001',
      action: 'place' as const,
      x: Math.floor(sp.x) - 2,
      y: Math.floor(sp.y) + 2,
      z: Math.floor(sp.z),
      block: 8,
    };
    await alice.send(msg);
    const auditsBefore = store.auditCount();
    const broadcastsBefore = bob.socket.ofType('blockApplied').length;

    // Retried message (e.g., after reconnect): same id, same content.
    const alice2 = new TestPlayer(coord, alice.playerId, 'Alice');
    await alice2.connect(); // replaces old session
    await alice2.send(msg);

    expect(store.auditCount()).toBe(auditsBefore); // no duplicate audit entry
    expect(store.getBlock(msg.x, msg.y, msg.z)).toBe(8);
    expect(bob.socket.ofType('blockApplied').length).toBe(broadcastsBefore); // not re-broadcast
    // But the retrier still receives an idempotent ack.
    expect(alice2.socket.ofType('blockApplied').map((m) => m.eid)).toContain('retry-edit-0001');
  });

  it('cascades sign removal to all subscribers when a sign block is broken', async () => {
    const { coord } = await makeWorld();
    const alice = new TestPlayer(coord, testId(), 'Alice');
    const bob = new TestPlayer(coord, testId(), 'Bob');
    await alice.connect();
    await bob.connect();
    const sp = coord.spawnPoint();
    const sx = Math.floor(sp.x) + 1;
    const sy = Math.floor(sp.y) + 2;
    const sz = Math.floor(sp.z);

    await alice.send({ t: 'edit', eid: nextEid(), action: 'place', x: sx, y: sy, z: sz, block: 13 });
    await alice.send({ t: 'sign', eid: nextEid(), op: 'create', x: sx, y: sy, z: sz, text: 'hello\nworld' });
    expect(bob.socket.ofType('signApplied').length).toBe(1);

    await bob.send({ t: 'edit', eid: nextEid(), action: 'break', x: sx, y: sy, z: sz });
    const removed = bob.socket.ofType('signApplied').filter((m) => m.op === 'remove');
    expect(removed.length).toBe(1);
    expect(bob.socket.ofType('blockApplied').at(-1)?.block).toBe(0);
    expect(coord.store.getSign(sx, sy, sz)).toBeNull();
  });
});

describe('signs over protocol', () => {
  it('creates, updates and removes signs; non-authors cannot modify them', async () => {
    const { coord } = await makeWorld();
    const alice = new TestPlayer(coord, testId(), 'Author');
    const mallory = new TestPlayer(coord, testId(), 'Mallory');
    await alice.connect();
    await mallory.connect();
    const sp = coord.spawnPoint();
    const s = { x: Math.floor(sp.x), y: Math.floor(sp.y) + 2, z: Math.floor(sp.z) + 1 };

    await alice.send({ t: 'edit', eid: nextEid(), action: 'place', ...s, block: 13 });
    await alice.send({ t: 'sign', eid: 'sign-create-01', op: 'create', ...s, text: 'welcome!' });

    const created = mallory.socket.ofType('signApplied')[0];
    expect(created.sign.text).toBe('welcome!');
    expect(created.sign.authorName).toBe('Author');
    expect(coord.store.getSign(s.x, s.y, s.z)?.text).toBe('welcome!');

    await alice.send({ t: 'sign', eid: 'sign-update-1', op: 'update', ...s, text: 'edited <script>' });
    expect(coord.store.getSign(s.x, s.y, s.z)?.text).toBe('edited <script>');

    // Mallory tries to hijack the sign.
    await mallory.send({ t: 'sign', eid: 'sign-hijack-1', op: 'update', ...s, text: 'hacked' });
    const last = mallory.socket.last() as { code: string };
    expect(last.code).toBe('sign_forbidden');
    expect(coord.store.getSign(s.x, s.y, s.z)?.text).toBe('edited <script>');

    await alice.send({ t: 'sign', eid: 'sign-remove-1', op: 'remove', ...s });
    expect(coord.store.getSign(s.x, s.y, s.z)).toBeNull();
  });

  it('sanitizes hostile sign text before storage/broadcast', async () => {
    const { coord } = await makeWorld();
    const alice = new TestPlayer(coord, testId(), 'Alice');
    await alice.connect();
    const sp = coord.spawnPoint();
    const s = { x: Math.floor(sp.x) - 1, y: Math.floor(sp.y) + 2, z: Math.floor(sp.z) };
    await alice.send({ t: 'edit', eid: nextEid(), action: 'place', ...s, block: 13 });
    await alice.send({
      t: 'sign',
      eid: 'sanitize-0001',
      op: 'create',
      ...s,
      text: '\u0000evil\n<img src=x>\nline three here ok\nfourth line gets dropped',
    });
    const stored = coord.store.getSign(s.x, s.y, s.z)!;
    expect(stored.text.split('\n')).toHaveLength(3);
    expect(stored.text).not.toContain('\u0000');
  });
});

describe('chat', () => {
  it('broadcasts sanitized chat to everyone', async () => {
    const { coord } = await makeWorld();
    const alice = new TestPlayer(coord, testId(), 'Alice');
    const bob = new TestPlayer(coord, testId(), 'Bob');
    await alice.connect();
    await bob.connect();
    await alice.send({ t: 'chat', text: '  hello \u0000 world ' });
    const chats = bob.socket.ofType('chatMsg');
    expect(chats.length).toBe(1);
    expect(chats[0].text).toBe('hello world');
    expect(chats[0].from.name).toBe('Alice');
  });
});

describe('malformed traffic and abuse', () => {
  it('responds to broken json with an error instead of crashing', async () => {
    const { coord } = await makeWorld();
    const p = new TestPlayer(coord, testId(), 'P');
    await p.connect();
    await p.handler.handleRawFrame('{{{not json');
    const last = p.socket.last() as { t: string; code: string };
    expect(last.t).toBe('error');
    expect(last.code).toBe('bad_json');
  });

  it('rejects unknown message types and binary frames safely', async () => {
    const { coord } = await makeWorld();
    const p = new TestPlayer(coord, testId(), 'P');
    await p.connect(false); // no auto-move: keep message count low
    await p.raw({ t: 'drop_tables' });
    expect((p.socket.last() as { code: string }).code).toBe('bad_message');

    await p.handler.handleRawFrame(new ArrayBuffer(16));
    const errs = p.socket.messages.filter((m) => m.t === 'error') as Array<{ code: string }>;
    expect(errs.some((e) => e.code === 'bad_message')).toBe(true);
  });

  it('closes oversized frames immediately', async () => {
    const { coord } = await makeWorld();
    const p = new TestPlayer(coord, testId(), 'P');
    await p.connect(false);
    await p.handler.handleRawFrame('x'.repeat(20 * 1024));
    expect(p.socket.closed).toBe(true);
    expect(p.socket.closeCode).toBe(CLOSE_CODES.oversizedFrame);
  });

  it('rate limits excessive messages then kicks the flooder', async () => {
    const { coord, store } = await makeWorld();
    const p = new TestPlayer(coord, testId(), 'Flooder');
    await p.connect(false);
    let sawRateLimit = false;
    for (let i = 0; i < 200 && !p.socket.closed; i++) {
      await p.raw({ t: 'ping', ts: i }); // valid but relentless
      const last = p.socket.last() as { code?: string } | undefined;
      if (last?.code === 'rate_limited') sawRateLimit = true;
    }
    expect(sawRateLimit).toBe(true);
    expect(p.socket.closed).toBe(true);
    expect(store.allBlocks().length).toBe(0);
  });

  it('requires hello before anything else', async () => {
    const { coord } = await makeWorld();
    const p = new TestPlayer(coord, testId(), 'LateHello');
    await p.raw({ t: 'chat', text: 'hi' });
    expect((p.socket.last() as { code: string }).code).toBe('not_joined');
  });

  it('rejects banned players at join time', async () => {
    const { coord, store } = await makeWorld();
    const pid = testId();
    const p = new TestPlayer(coord, pid, 'Banned');
    await p.connect(false);
    p.disconnect();
    store.setBan(pid, 'griefing', 'admin');

    const again = new TestPlayer(coord, pid, 'Banned');
    await again.connect(false);
    const last = again.socket.last() as { t: string; code?: string };
    expect(last.t === 'error' && last.code === 'banned').toBe(true);
    expect(again.socket.closed).toBe(true);
    expect(again.socket.closeCode).toBe(CLOSE_CODES.banned);
  });

  it('locks the world when terrain versions mismatch', async () => {
    const db = new DatabaseSync(':memory:');
    const store = new WorldStore(new FakeSql(db));
    await store.init('seed');
    db.prepare(`UPDATE meta SET value='0' WHERE key='terrainVersion'`).run();
    const lockedStore = new WorldStore(new FakeSql(db));
    const coord = new WorldCoordinator(lockedStore);
    await coord.init().catch(() => undefined);
    expect(coord.worldLocked).toBeTruthy();

    const p = new TestPlayer(coord, testId(), 'Unlucky');
    await p.connect(false);
    const last = p.socket.last() as { t: string; code?: string };
    expect(last.t === 'error' && last.code === 'world_locked').toBe(true);
    expect(p.socket.closed).toBe(true);
  });
});

describe('movement sync and subscriptions', () => {
  it('relays positions between players', async () => {
    const { coord } = await makeWorld();
    const alice = new TestPlayer(coord, testId(), 'Alice');
    const bob = new TestPlayer(coord, testId(), 'Bob');
    await alice.connect();
    await bob.connect();
    await alice.send({ t: 'pos', x: 12.5, y: 30, z: -4.25, yaw: 1.2, pitch: -0.3 });
    const ps = bob.socket.ofType('ps').find((m) => m.id === alice.playerId);
    expect(ps).toMatchObject({ x: 12.5, y: 30, z: -4.25 });
  });

  it('pushes chunk snapshots when a player travels far enough', async () => {
    const { coord } = await makeWorld();
    const alice = new TestPlayer(coord, testId(), 'Traveler');
    await alice.connect();
    const syncCountAtJoin = alice.socket.ofType('syncStart').length;
    expect(syncCountAtJoin).toBeGreaterThanOrEqual(1);

    // Teleport far away (within coordinate bounds).
    await alice.send({ t: 'pos', x: 50_000.5, y: 40, z: -50_000.5, yaw: 0, pitch: 0 });
    const syncs = alice.socket.ofType('syncStart');
    expect(syncs.length).toBeGreaterThan(syncCountAtJoin);
    const last = syncs.at(-1)!;
    expect(last.chunks.some(([cx]) => Math.abs(cx) > 1000)).toBe(true);
    expect(alice.socket.ofType('syncDone').length).toBe(syncs.length);
  });
});

describe('restart persistence (file-backed sqlite)', () => {
  it('keeps blocks and signs across a full server reinitialization', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'eb-world-'));
    const dbPath = join(dir, 'world.db');
    try {
      // --- First server lifetime ---
      const db1 = new DatabaseSync(dbPath);
      const store1 = new WorldStore(new FakeSql(db1));
      const coord1 = new WorldCoordinator(store1);
      await coord1.init();
      const seed1 = coord1.seed;

      const alice = new TestPlayer(coord1, testId(), 'Alice');
      await alice.connect();
      const sp = coord1.spawnPoint();
      const bx = Math.floor(sp.x) + 3;
      const by = Math.floor(sp.y) + 2;
      const bz = Math.floor(sp.z) + 3;
      await alice.send({ t: 'edit', eid: 'persist-block-1', action: 'place', x: bx, y: by, z: bz, block: 9 });
      await alice.send({ t: 'edit', eid: 'persist-sign-1', action: 'place', x: bx + 1, y: by, z: bz, block: 13 });
      await alice.send({ t: 'sign', eid: 'persist-sign-txt', op: 'create', x: bx + 1, y: by, z: bz, text: 'was here' });
      db1.close();

      // --- Second server lifetime over the same storage ---
      const db2 = new DatabaseSync(dbPath);
      const store2 = new WorldStore(new FakeSql(db2));
      const coord2 = new WorldCoordinator(store2);
      await coord2.init();
      expect(coord2.seed).toBe(seed1);

      const bob = new TestPlayer(coord2, testId(), 'Bob');
      await bob.connect();
      const chunkMsgs = bob.socket.ofType('chunk');
      let foundBlock = false;
      let foundSign = false;
      for (const c of chunkMsgs) {
        if (Math.floor(bx / 16) === c.cx && Math.floor(bz / 16) === c.cz && c.overrides.some(([, b]) => b === 9)) {
          foundBlock = true;
        }
        for (const s of c.signs) {
          if (s.text === 'was here') foundSign = true;
        }
      }
      expect(foundBlock).toBe(true);
      expect(foundSign).toBe(true);
      expect(store2.getBlock(bx, by, bz)).toBe(9);
      expect(store2.getSign(bx + 1, by, bz)?.text).toBe('was here');
      db2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

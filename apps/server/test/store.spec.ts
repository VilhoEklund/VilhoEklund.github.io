import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { WorldStore, WorldLockedError } from '../src/store.ts';
import { FakeSql } from './harness.ts';

async function freshStore(now: () => number = () => 1_700_000_000_000): Promise<{ store: WorldStore; db: DatabaseSync }> {
  const db = new DatabaseSync(':memory:');
  const store = new WorldStore(new FakeSql(db), now);
  await store.init('test-world-seed');
  return { store, db };
}

describe('world initialization', () => {
  it('creates stable metadata on first init and never rotates it', async () => {
    const { store, db } = await freshStore();
    const meta1 = store.meta;
    expect(meta1.seed).toBeGreaterThan(0);
    expect(meta1.seedString).toBe('test-world-seed');

    // A brand-new store over the same database must read the same world.
    const store2 = new WorldStore(new FakeSql(db), () => Date.now());
    await store2.init('a-completely-different-seed');
    expect(store2.meta.seed).toBe(meta1.seed);
    expect(store2.meta.seedString).toBe(meta1.seedString);
  });

  it('is idempotent when init runs twice on the same store', async () => {
    const { store } = await freshStore();
    const meta1 = store.meta;
    await store.init('ignored');
    expect(store.meta).toEqual(meta1);
  });

  it('locks the world if the persisted terrain version differs', async () => {
    const db = new DatabaseSync(':memory:');
    const store = new WorldStore(new FakeSql(db));
    await store.init('seed');
    // Simulate a world created by a different generator version.
    db.prepare(`UPDATE meta SET value='0' WHERE key='terrainVersion'`).run();
    const store2 = new WorldStore(new FakeSql(db));
    await expect(store2.init()).rejects.toBeInstanceOf(WorldLockedError);
  });
});

describe('block persistence', () => {
  it('stores overrides and reads them back per chunk (negative coords too)', async () => {
    const { store } = await freshStore();
    await store.applyBlock({ eid: 'e1aaaaaaaa', x: -3, y: 40, z: -20, block: 9, actorId: 'alice0000xxxx', actorName: 'Alice' });

    expect(store.getBlock(-3, 40, -20)).toBe(9);
    expect(store.getBlock(-3, 41, -20)).toBeNull();

    // Chunk (-1,-2) must contain exactly this override with the right local index.
    const overrides = store.chunkOverrides(-1, -2);
    expect(overrides.length).toBe(1);
    const [idx, block] = overrides[0];
    expect(block).toBe(9);
    const lx = ((-3 % 16) + 16) % 16;
    const lz = ((-20 % 16) + 16) % 16;
    expect(idx).toBe(lx + lz * 16 + 40 * 256);
  });

  it('upserts the same cell without duplicating rows', async () => {
    const { store } = await freshStore();
    await store.applyBlock({ eid: 'a1aaaaaaaa', x: 1, y: 2, z: 3, block: 4, actorId: 'p', actorName: 'P' });
    await store.applyBlock({ eid: 'a2aaaaaaaa', x: 1, y: 2, z: 3, block: 8, actorId: 'p', actorName: 'P' });
    expect(store.getBlock(1, 2, 3)).toBe(8);
    expect(store.allBlocks().length).toBe(1);
  });

  it('is idempotent on retried edit ids and does not double-audit', async () => {
    const { store } = await freshStore();
    const msg = { eid: 'retry00001aaa', x: 0, y: 5, z: 0, block: 2, actorId: 'p', actorName: 'P' };
    const r1 = await store.applyBlock(msg);
    const auditsAfterFirst = store.auditCount();
    const r2 = await store.applyBlock(msg);
    expect(r1.duplicate).toBe(false);
    expect(r2.duplicate).toBe(true);
    expect(store.auditCount()).toBe(auditsAfterFirst);
    expect(store.getBlock(0, 5, 0)).toBe(2);
  });

  it('cascades sign removal when a sign block is broken', async () => {
    const { store } = await freshStore();
    await store.applyBlock({ eid: 'sb00000001a', x: 4, y: 30, z: 4, block: 13, actorId: 'p', actorName: 'P' });
    await store.applySign({ eid: 'sg00000001a', op: 'create', x: 4, y: 30, z: 4, text: 'hello', actorId: 'p', actorName: 'P' });
    expect(store.getSign(4, 30, 4)?.text).toBe('hello');

    const r = await store.applyBlock({
      eid: 'br00000001a',
      x: 4,
      y: 30,
      z: 4,
      block: 0,
      actorId: 'p',
      actorName: 'P',
      cascadeSignRemove: true,
    });
    expect(r.signRemoved).toBe(true);
    expect(store.getSign(4, 30, 4)).toBeNull();
    expect(store.getBlock(4, 30, 4)).toBe(0);
  });
});

describe('sign persistence and sanitization', () => {
  it('persists text, author and timestamps; updates keep the row unique', async () => {
    const { store } = await freshStore();
    await store.applySign({ eid: 's100000000a', op: 'create', x: 10, y: 33, z: -11, text: 'line1\nline2', actorId: 'alice0000xxxx', actorName: 'Alice' });
    const s1 = store.getSign(10, 33, -11);
    expect(s1?.text).toBe('line1\nline2');
    expect(s1?.authorName).toBe('Alice');

    await store.applySign({ eid: 's200000000a', op: 'update', x: 10, y: 33, z: -11, text: 'edited', actorId: 'alice0000xxxx', actorName: 'Alice' });
    const signs = store.allSigns();
    expect(signs.length).toBe(1);
    expect(signs[0].text).toBe('edited');
  });

  it('removes signs idempotently', async () => {
    const { store } = await freshStore();
    await store.applySign({ eid: 'r100000000a', op: 'create', x: 1, y: 1, z: 1, text: 'x', actorId: 'a', actorName: 'A' });
    const r1 = await store.applySign({ eid: 'r200000000a', op: 'remove', x: 1, y: 1, z: 1, text: '', actorId: 'a', actorName: 'A' });
    expect(r1.duplicate).toBe(false);
    const r2 = await store.applySign({ eid: 'r300000000a', op: 'remove', x: 1, y: 1, z: 1, text: '', actorId: 'a', actorName: 'A' });
    expect(r2.duplicate).toBe(false);
    expect(store.getSign(1, 1, 1)).toBeNull();
  });

  it('sign text stored is already-sanitized input (defense in depth re-check)', async () => {
    const { store } = await freshStore();
    // The coordinator sanitizes before calling the store; the store itself
    // must also refuse to blow up on weird input.
    await store.applySign({ eid: 'w000000000a', op: 'create', x: 0, y: 0, z: 0, text: '\u0000bad', actorId: 'a', actorName: 'A' });
    expect(typeof store.getSign(0, 0, 0)?.text).toBe('string');
  });
});

describe('players and moderation', () => {
  it('records joins, presence and positions', async () => {
    const { store } = await freshStore();
    store.recordJoin('player0001aaa', 'Alice');
    expect(store.getPlayer('player0001aaa')?.name).toBe('Alice');
    expect(store.rosterOnline(90_000).length).toBe(1);
    store.persistPosition('player0001aaa', 1.5, 2.5, 3.5);
    expect(store.lastKnownPosition('player0001aaa')).toEqual({ x: 1.5, y: 2.5, z: 3.5 });
    store.markOnline('player0001aaa', 0);
    expect(store.rosterOnline(90_000).length).toBe(0);
  });

  it('bans prevent nothing at store level but are recorded and exportable', async () => {
    const { store } = await freshStore();
    store.recordJoin('banned0001aaa', 'Villain');
    expect(store.setBan('banned0001aaa', 'griefing', 'admin')).toBe(true);
    expect(store.getPlayer('banned0001aaa')?.banned).toBe(true);
    expect(store.listBans().length).toBe(1);
    expect(store.clearBan('banned0001aaa', 'admin')).toBe(true);
    expect(store.getPlayer('banned0001aaa')?.banned).toBe(false);
  });
});

describe('export and import', () => {
  it('exports meta, blocks, signs and bans in the documented format', async () => {
    const { store } = await freshStore();
    await store.applyBlock({ eid: 'x100000000a', x: 7, y: 8, z: 9, block: 3, actorId: 'p', actorName: 'P' });
    await store.applySign({ eid: 'x200000000a', op: 'create', x: 7, y: 9, z: 9, text: 'note', actorId: 'p', actorName: 'P' });
    const data = store.exportAll();
    expect(data.format).toBe('eternal-blocks/world-export@1');
    expect(data.meta.seed).toBe(store.meta.seed);
    expect(data.blocks).toHaveLength(1);
    expect(data.signs).toHaveLength(1);
    expect(data.auditTail.length).toBeGreaterThan(0);
  });

  it('importMerge applies newer rows and refuses foreign seeds', async () => {
    const { store } = await freshStore();
    await store.applyBlock({ eid: 'm100000000a', x: 1, y: 1, z: 1, block: 2, actorId: 'p', actorName: 'P' });
    const res = await store.importMerge({
      blocks: [
        { x: 1, y: 1, z: 1, block: 9, updatedAt: 1_800_000_000_000 }, // newer than stored -> wins
        { x: 2, y: 1, z: 1, block: 4, updatedAt: 1 }, // brand new row
      ],
      signs: [{ x: 3, y: 1, z: 1, text: 'restored', authorId: 'a', authorName: 'A', updatedAt: 1_800_000_000_000 }],
    });
    expect(res.blocksMerged).toBe(2);
    expect(res.signsMerged).toBe(1);
    expect(store.getBlock(1, 1, 1)).toBe(9);
    expect(store.getBlock(2, 1, 1)).toBe(4);
    expect(store.getSign(3, 1, 1)?.text).toBe('restored');

    await expect(
      store.importMerge({ meta: { seed: (store.meta.seed + 1) >>> 0 } }),
    ).rejects.toBeInstanceOf(WorldLockedError);
  });
});

describe('audit log', () => {
  it('records block and sign actions with actor info', async () => {
    const { store } = await freshStore();
    await store.applyBlock({ eid: 'au00000001a', x: 0, y: 0, z: 1, block: 5, actorId: 'alice0000xxxx', actorName: 'Alice' });
    const rows = store.allBlocks();
    expect(rows.length).toBe(1);
    expect(store.auditCount()).toBeGreaterThanOrEqual(2); // world-init + block
  });

  it('prunes old audit rows', async () => {
    const { store } = await freshStore();
    for (let i = 0; i < 30; i++) {
      store.audit('a', 'test', JSON.stringify({ i }));
    }
    store.pruneAudit(10);
    expect(store.auditCount()).toBeLessThanOrEqual(10);
  });
});

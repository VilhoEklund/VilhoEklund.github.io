import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, WORLD_HEIGHT } from '@eternal-blocks/shared';
import { WorldStore } from '../src/game/world/worldStore.ts';

describe('WorldStore', () => {
  it('generates identical terrain for the same seed (client matches server)', () => {
    const a = new WorldStore(12345);
    const b = new WorldStore(12345);
    expect(a.getBlock(-5, 30, -9)).toBe(b.getBlock(-5, 30, -9));
    expect(a.getBlock(1000, 20, 1000)).toBe(b.getBlock(1000, 20, 1000));
  });

  it('applies overrides on top of generated terrain and keeps them across eviction', () => {
    const w = new WorldStore(777);
    w.setOverride(3, 40, 4, 9);
    expect(w.getBlock(3, 40, 4)).toBe(9);

    // Evict all cached chunks; overrides must survive regeneration.
    w.pruneAround(9999, 9999, 0);
    expect(w.chunks.size).toBeLessThanOrEqual(1);
    expect(w.getBlock(3, 40, 4)).toBe(9);
  });

  it('applySnapshot replaces prior overrides and upserts signs', () => {
    const w = new WorldStore(42);
    w.setOverride(1, 2, 3, 5);
    const idx = 1 + 3 * CHUNK_SIZE + 2 * CHUNK_SIZE * CHUNK_SIZE;
    w.applySnapshot(0, 0, [[idx, 8]], [
      { x: 10, y: 33, z: 10, text: 'hi', authorId: 'a', authorName: 'A', updatedAt: 5 },
    ]);
    expect(w.getBlock(1, 2, 3)).toBe(8);
    expect(w.signs.get('10,33,10')?.text).toBe('hi');

    // A second snapshot with fewer overrides fully replaces the set.
    w.applySnapshot(0, 0, [], []);
    expect(w.overridesByChunk.get('0,0')?.size ?? 0).toBe(0);
    expect(w.getBlock(1, 2, 3)).not.toBe(8);
  });

  it('resetForResync clears all deltas but the object stays usable', () => {
    const w = new WorldStore(7);
    w.setOverride(1, 1, 1, 2);
    w.upsertSign({ x: 1, y: 1, z: 2, text: 'x', authorId: 'a', authorName: 'b', updatedAt: 0 });
    w.resetForResync();
    expect(w.signs.size).toBe(0);
    expect(w.overridesByChunk.size).toBe(0);
    expect(typeof w.getBlock(1, 1, 1)).toBe('number');
  });

  it('bounds-checks vertical coordinates', () => {
    const w = new WorldStore(7);
    expect(w.getBlock(0, -1, 0)).toBe(0);
    expect(w.getBlock(0, WORLD_HEIGHT, 0)).toBe(0);
    w.setOverride(0, WORLD_HEIGHT + 5, 0, 3); // ignored
    expect(w.overridesByChunk.get('0,0')?.size ?? 0).toBe(0);
  });
});

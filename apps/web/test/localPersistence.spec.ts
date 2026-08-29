import { describe, expect, it } from 'vitest';
import { BlockId, TerrainGenerator } from '@eternal-blocks/shared';
import { LocalWorldPersistence } from '../src/game/world/localPersistence.ts';
import { WorldStore } from '../src/game/world/worldStore.ts';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('local world persistence', () => {
  it('restores block edits and signs after a reload', () => {
    const storage = new MemoryStorage();
    const seed = TerrainGenerator.fromSeedString('browser-save-test').seed;
    const firstWorld = new WorldStore(seed);
    const persistence = new LocalWorldPersistence(seed, storage);

    firstWorld.setOverride(-2, 35, 17, BlockId.Brick);
    firstWorld.upsertSign({
      x: -2,
      y: 36,
      z: 17,
      text: 'still here',
      authorId: 'local-player',
      authorName: 'Builder',
      updatedAt: 123,
      rot: 2,
    });
    expect(persistence.saveChunkAt(firstWorld, -2, 17)).toBe(true);

    const reloadedWorld = new WorldStore(seed);
    expect(new LocalWorldPersistence(seed, storage).loadInto(reloadedWorld)).toBe(1);
    expect(reloadedWorld.getBlock(-2, 35, 17)).toBe(BlockId.Brick);
    expect(reloadedWorld.signs.get('-2,36,17')).toMatchObject({
      text: 'still here',
      authorName: 'Builder',
      rot: 2,
    });
  });

  it('does not mix saves between generated world seeds', () => {
    const storage = new MemoryStorage();
    const firstWorld = new WorldStore(111);
    firstWorld.setOverride(1, 40, 1, BlockId.Glass);
    new LocalWorldPersistence(111, storage).saveChunkAt(firstWorld, 1, 1);

    const regeneratedWorld = new WorldStore(222);
    expect(new LocalWorldPersistence(222, storage).loadInto(regeneratedWorld)).toBe(0);
    expect(regeneratedWorld.overridesByChunk.size).toBe(0);
  });
});

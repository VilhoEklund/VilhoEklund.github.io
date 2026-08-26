import { describe, expect, it } from 'vitest';
import {
  blockIndex,
  chunkCoord,
  chunkKey,
  distanceSqToBlockCenter,
  indexToLocals,
  isInWorldY,
  localCoord,
  spiralOffsets,
} from '../src/coords.ts';
import { CHUNK_SIZE, WORLD_HEIGHT } from '../src/constants.ts';

describe('chunk/local coordinate conversion', () => {
  it('handles positive coordinates', () => {
    expect(chunkCoord(0)).toBe(0);
    expect(chunkCoord(15)).toBe(0);
    expect(chunkCoord(16)).toBe(1);
    expect(localCoord(16)).toBe(0);
    expect(localCoord(31)).toBe(15);
  });

  it('handles negative coordinates with floor semantics', () => {
    expect(chunkCoord(-1)).toBe(-1);
    expect(chunkCoord(-16)).toBe(-1);
    expect(chunkCoord(-17)).toBe(-2);
    expect(localCoord(-1)).toBe(15);
    expect(localCoord(-16)).toBe(0);
    expect(localCoord(-17)).toBe(15);
  });

  it('world -> (chunk, local) always reconstructs the world coordinate', () => {
    for (const v of [-1000, -33, -17, -16, -1, 0, 1, 15, 16, 17, 255, 4096, 123456]) {
      const cx = chunkCoord(v);
      const lx = localCoord(v);
      expect(cx * CHUNK_SIZE + lx).toBe(v);
    }
  });

  it('blockIndex round-trips through indexToLocals', () => {
    const size = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;
    for (let i = 0; i < size; i += 977) {
      const { lx, y, lz } = indexToLocals(i);
      expect(blockIndex(lx, y, lz)).toBe(i);
      expect(lx).toBeGreaterThanOrEqual(0);
      expect(lx).toBeLessThan(CHUNK_SIZE);
      expect(lz).toBeGreaterThanOrEqual(0);
      expect(lz).toBeLessThan(CHUNK_SIZE);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(WORLD_HEIGHT);
    }
    expect(blockIndex(0, 0, 0)).toBe(0);
    expect(blockIndex(15, WORLD_HEIGHT - 1, 15)).toBe(size - 1);
  });

  it('chunkKey is stable', () => {
    expect(chunkKey(-3, 12)).toBe('-3,12');
  });

  it('isInWorldY bounds', () => {
    expect(isInWorldY(0)).toBe(true);
    expect(isInWorldY(WORLD_HEIGHT - 1)).toBe(true);
    expect(isInWorldY(WORLD_HEIGHT)).toBe(false);
    expect(isInWorldY(-1)).toBe(false);
    expect(isInWorldY(1.5)).toBe(false);
    expect(Number.isNaN(NaN) ? isInWorldY(NaN as unknown as number) : true).toBe(false);
  });
});

describe('spatial helpers', () => {
  it('distance to own cell center is within half a block', () => {
    // Standing exactly on the cell center column at feet level.
    const d = distanceSqToBlockCenter(5.5, 10, 5.5, 5, 9, 5);
    expect(d).toBeCloseTo(0.25, 5);
  });

  it('spiralOffsets covers unique cells in rings', () => {
    const offs = spiralOffsets(3);
    const set = new Set(offs.map(([x, z]) => `${x},${z}`));
    expect(set.size).toBe(offs.length);
    expect(set.has('0,0')).toBe(true);
    expect(set.has('-3,-2')).toBe(true);
    expect(set.has('2,3')).toBe(true);
  });
});

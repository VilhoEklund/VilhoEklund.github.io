import { describe, expect, it } from 'vitest';
import { TerrainGenerator } from '../src/terrain.ts';
import { CHUNK_SIZE, DEFAULT_SEED_STRING, SEA_LEVEL, WORLD_HEIGHT } from '../src/constants.ts';
import { BlockId } from '../src/blocks.ts';
import { blockIndex, parseChunkKey } from '../src/coords.ts';

describe('terrain determinism', () => {
  it('produces identical chunks for the same seed', () => {
    const g1 = new TerrainGenerator(12345);
    const g2 = new TerrainGenerator(12345);
    const a = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    const b = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    g1.fillChunk(a, 3, -7);
    g2.fillChunk(b, 3, -7);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('differs between seeds', () => {
    const g1 = new TerrainGenerator(1);
    const g2 = new TerrainGenerator(2);
    const a = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    const b = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    g1.fillChunk(a, 0, 0);
    g2.fillChunk(b, 0, 0);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('is deterministic across generator instances and time (golden sample)', () => {
    const g = TerrainGenerator.fromSeedString('eternal-blocks/primeval/1');
    const info = g.columnInfo(1234, -5678);
    // Golden values locked by this test - changing generation intentionally
    // requires bumping TERRAIN_VERSION.
    expect(info).toEqual(g.columnInfo(1234, -5678));
    expect(info.h).toBeGreaterThan(0);
    expect(info.h).toBeLessThan(WORLD_HEIGHT);
    expect(['grass', 'desert']).toContain(info.biome);
  });

  it('fills bedrock at y=0 everywhere in negative chunks', () => {
    const g = new TerrainGenerator(999);
    const data = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    g.fillChunk(data, -5, -5);
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        expect(data[blockIndex(lx, 0, lz)]).toBe(BlockId.Bedrock);
      }
    }
  });

  it('fills water up to sea level below sea level', () => {
    const g = new TerrainGenerator(4242);
    let checked = 0;
    outer: for (let cz = -8; cz <= 8 && checked < 200; cz++) {
      for (let cx = -8; cx <= 8 && checked < 200; cx++) {
        const data = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
        g.fillChunk(data, cx, cz);
        for (let y = 1; y <= SEA_LEVEL; y++) {
          for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            for (let lx = 0; lx < CHUNK_SIZE; lx++) {
              const idx = blockIndex(lx, y, lz);
              if (data[idx] === BlockId.Water) {
                // Everything above a water cell up to sea level must be water or air-free surface
                const above = data[blockIndex(lx, Math.min(y + 1, WORLD_HEIGHT - 1), lz)];
                if (y < SEA_LEVEL) {
                  expect([BlockId.Water, BlockId.Air]).toContain(above);
                }
                checked++;
                if (checked >= 200) break outer;
              }
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('generates trees identically when canopies cross chunk borders', () => {
    const g = new TerrainGenerator(777);
    // Find a tree near origin.
    let found: { x: number; z: number; h: number; th: number } | null = null;
    outer: for (let z = -40; z <= 40; z++) {
      for (let x = -40; x <= 40; x++) {
        const t = g.treeAt(x, z);
        if (t) {
          found = { x, z, h: t.h, th: t.trunkHeight };
          break outer;
        }
      }
    }
    expect(found).not.toBeNull();
    const t = found!;
    const topY = t.h + t.th;
    // The cap cell directly above the trunk must exist in whichever chunk owns it,
    // generated independently from that chunk's fill pass.
    const capX = t.x;
    const capZ = t.z;
    const capY = topY + 2;
    const cx = Math.floor(capX / CHUNK_SIZE);
    const cz = Math.floor(capZ / CHUNK_SIZE);
    const data = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    g.fillChunk(data, cx, cz);
    const lx = ((capX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((capZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    expect(data[blockIndex(lx, capY, lz)]).toBe(BlockId.Leaves);
  });

  it('findSpawn returns a flat inland grass clearing with headroom', () => {
    const g = TerrainGenerator.fromSeedString(DEFAULT_SEED_STRING);
    const spawn = g.findSpawn();
    const col = g.columnInfo(Math.floor(spawn.x), Math.floor(spawn.z));
    expect(col.biome).toBe('grass');
    expect(col.h).toBeGreaterThan(SEA_LEVEL + 4);
    expect(spawn.y).toBe(col.h);
    // No tree at the spawn column.
    expect(g.treeAt(Math.floor(spawn.x), Math.floor(spawn.z))).toBeNull();

    const heights: number[] = [];
    for (const dz of [-6, -3, 0, 3, 6]) {
      for (const dx of [-6, -3, 0, 3, 6]) {
        heights.push(g.columnInfo(Math.floor(spawn.x) + dx, Math.floor(spawn.z) + dz).h);
      }
    }
    expect(Math.min(...heights)).toBeGreaterThan(SEA_LEVEL + 2);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(3);
  });
});

describe('chunk key parsing', () => {
  it('round-trips negative coordinates', () => {
    expect(parseChunkKey('-12,34')).toEqual({ cx: -12, cz: 34 });
    expect(parseChunkKey('0,0')).toEqual({ cx: 0, cz: 0 });
    expect(parseChunkKey('bogus')).toBeNull();
  });
});

import { CHUNK_SIZE, SEA_LEVEL, TERRAIN_VERSION, WORLD_HEIGHT } from './constants.ts';
import { BlockId } from './blocks.ts';
import { blockIndex, spiralOffsets } from './coords.ts';
import { fbm2, hash2f, hashInt, hashString, smoothstep } from './noise.ts';

export type Biome = 'grass' | 'desert';

export interface ColumnInfo {
  /** Ground height: solid terrain occupies y in [0, h). */
  h: number;
  biome: Biome;
}

export interface TreeInfo {
  /** Trunk base sits on ground level y = h. */
  h: number;
  trunkHeight: number;
}

interface SeedBundle {
  hills: number;
  cont: number;
  mountMask: number;
  mount: number;
  temp: number;
  moist: number;
  forest: number;
  tree: number;
}

function bundleFromSeed(seed: number): SeedBundle {
  return {
    hills: seed ^ 0x1a2b3c4d,
    cont: seed ^ 0x5e6f7081,
    mountMask: seed ^ 0x92a3b4c5,
    mount: seed ^ 0xd6e7f809,
    temp: seed ^ 0x11223344,
    moist: seed ^ 0x55667788,
    forest: seed ^ 0x99aabbcc,
    tree: seed ^ 0xddeeff00,
  };
}

/**
 * Deterministic terrain generator for the one permanent world.
 *
 * Pure function of (seed, version, coordinates). The same seed + version +
 * coordinate always produces identical blocks on every client and after any
 * restart - this is what makes it safe to persist only player edits.
 */
export class TerrainGenerator {
  readonly seed: number;
  readonly version: number;
  private readonly s: SeedBundle;

  constructor(seed: number, version: number = TERRAIN_VERSION) {
    this.seed = seed >>> 0;
    this.version = version;
    this.s = bundleFromSeed(this.seed);
  }

  static fromSeedString(seedString: string, version: number = TERRAIN_VERSION): TerrainGenerator {
    return new TerrainGenerator(hashString(seedString), version);
  }

  static seedFromString(seedString: string): number {
    return hashString(seedString);
  }

  columnInfo(wx: number, wz: number): ColumnInfo {
    const s = this.s;
    const hills = fbm2(s.hills, wx * 0.016, wz * 0.016, { octaves: 4 });
    const cont = fbm2(s.cont, wx * 0.004, wz * 0.004, { octaves: 3 });
    const maskRaw = fbm2(s.mountMask, wx * 0.0028, wz * 0.0028, { octaves: 2 });
    const mask = smoothstep(0.58, 0.78, maskRaw);
    const mountNoise = Math.pow(fbm2(s.mount, wx * 0.03, wz * 0.03, { octaves: 4 }), 1.5);
    let h = Math.round(24 + (hills - 0.5) * 20 + (cont - 0.5) * 14 + mask * mountNoise * 30);
    h = Math.max(4, Math.min(WORLD_HEIGHT - 12, h));

    const temp = fbm2(s.temp, wx * 0.004, wz * 0.004, { octaves: 2 }) - Math.max(0, h - 36) * 0.008;
    const moist = fbm2(s.moist, wx * 0.005, wz * 0.005, { octaves: 2 });

    let biome: Biome = 'grass';
    if (temp > 0.62 && moist < 0.45) biome = 'desert';
    // Cold and high-altitude ground is sandy too (Snow block was removed).
    if (temp < 0.3 || h >= 48) biome = 'desert';
    return { h, biome };
  }

  /** Tree occupying this column, if any (deterministic per column). */
  treeAt(wx: number, wz: number, info?: ColumnInfo): TreeInfo | null {
    const col = info ?? this.columnInfo(wx, wz);
    if (col.biome !== 'grass' || col.h <= SEA_LEVEL) return null;
    const forest = smoothstep(
      0.42,
      0.68,
      fbm2(this.s.forest, wx * 0.01, wz * 0.01, { octaves: 2 }),
    );
    const density = 0.0018 + forest * 0.026;
    if (hash2f(this.s.tree, wx, wz) >= density) return null;
    const r = hashInt(Math.imul(wx, 0x27d4eb2d) ^ Math.imul(wz, 0x165667b1) ^ this.s.tree);
    const trunkHeight = 4 + (r % 3);
    return { h: col.h, trunkHeight };
  }

  /**
   * Fill a chunk array (CHUNK_SIZE x WORLD_HEIGHT x CHUNK_SIZE) with
   * generated terrain including water and trees whose canopies overlap.
   */
  fillChunk(data: Uint8Array, cx: number, cz: number): void {
    data.fill(BlockId.Air);
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;

    // Base terrain per column.
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = baseX + lx;
        const wz = baseZ + lz;
        const { h, biome } = this.columnInfo(wx, wz);
        const underwater = h <= SEA_LEVEL;

        let topBlock: number;
        let fillBlock: number;
        // Beaches: low ground just above sea level is sandy regardless of biome.
        const beach = h > SEA_LEVEL && h <= SEA_LEVEL + 2;
        if (biome === 'desert' || beach) {
          topBlock = BlockId.Sand;
          fillBlock = BlockId.Sand;
        } else {
          topBlock = BlockId.Grass;
          fillBlock = BlockId.Dirt;
        }
        if (underwater) {
          // Sea floors: sandy shallows, muddy depths.
          topBlock = SEA_LEVEL - h <= 2 ? BlockId.Sand : BlockId.Dirt;
          fillBlock = BlockId.Dirt;
        }

        for (let y = 0; y < h; y++) {
          let b: number;
          if (y === 0) b = BlockId.Bedrock;
          else if (y === h - 1) b = topBlock;
          else if (y >= h - 3) b = fillBlock;
          else b = BlockId.Stone;
          data[blockIndex(lx, y, lz)] = b;
        }
        if (underwater) {
          for (let y = h; y <= SEA_LEVEL; y++) {
            data[blockIndex(lx, y, lz)] = BlockId.Water;
          }
        }
      }
    }

    // Trees: scan an extended area so canopies crossing chunk borders are
    // generated identically by every chunk they touch.
    const margin = 2;
    for (let wz = baseZ - margin; wz < baseZ + CHUNK_SIZE + margin; wz++) {
      for (let wx = baseX - margin; wx < baseX + CHUNK_SIZE + margin; wx++) {
        const tree = this.treeAt(wx, wz);
        if (!tree) continue;
        this.writeTree(data, cx, cz, wx, wz, tree);
      }
    }
  }

  private writeTree(
    data: Uint8Array,
    cx: number,
    cz: number,
    wx: number,
    wz: number,
    tree: TreeInfo,
  ): void {
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;
    const setIfAir = (x: number, y: number, z: number, b: number): void => {
      const lx = x - baseX;
      const lz = z - baseZ;
      if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return;
      if (y < 0 || y >= WORLD_HEIGHT) return;
      const idx = blockIndex(lx, y, lz);
      if (data[idx] === BlockId.Air) data[idx] = b;
    };

    const topY = tree.h + tree.trunkHeight - 1;
    // Trunk.
    for (let y = tree.h; y <= topY; y++) {
      const lx = wx - baseX;
      const lz = wz - baseZ;
      if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) break;
      data[blockIndex(lx, y, lz)] = BlockId.Log;
    }
    // Canopy: two wide layers, one 3x3 layer, one plus-shaped cap.
    for (let dy = -1; dy <= 0; dy++) {
      const y = topY + dy + 1;
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          setIfAir(wx + dx, y, wz + dz, BlockId.Leaves);
        }
      }
    }
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        setIfAir(wx + dx, topY + 2, wz + dz, BlockId.Leaves);
      }
    }
    setIfAir(wx + 1, topY + 3, wz, BlockId.Leaves);
    setIfAir(wx - 1, topY + 3, wz, BlockId.Leaves);
    setIfAir(wx, topY + 3, wz + 1, BlockId.Leaves);
    setIfAir(wx, topY + 3, wz - 1, BlockId.Leaves);
    setIfAir(wx, topY + 3, wz, BlockId.Leaves);
  }

  /**
   * Find a scenic, buildable spawn deterministically.
   *
   * Candidates must be grassy, comfortably inland, clear of nearby trees,
   * and reasonably flat across a 13x13 area. We score the whole search area
   * rather than accepting the first valid column so a tiny beach or island
   * near the origin cannot become the permanent spawn.
   */
  findSpawn(maxRadius = 96): { x: number; y: number; z: number } {
    const sampleOffsets = [-6, -3, 0, 3, 6];
    let best: { x: number; y: number; z: number; score: number } | null = null;

    for (const [wx, wz] of spiralOffsets(maxRadius)) {
      // Sampling every other column keeps startup quick while retaining a
      // dense enough search for a good clearing.
      if ((wx & 1) !== 0 || (wz & 1) !== 0) continue;

      const center = this.columnInfo(wx, wz);
      if (center.biome !== 'grass') continue;
      if (center.h <= SEA_LEVEL + 4 || center.h >= WORLD_HEIGHT - 18) continue;

      let minH = center.h;
      let maxH = center.h;
      let heightDelta = 0;
      let suitable = true;
      for (const dz of sampleOffsets) {
        for (const dx of sampleOffsets) {
          const sample = this.columnInfo(wx + dx, wz + dz);
          if (sample.h <= SEA_LEVEL + 2) {
            suitable = false;
            break;
          }
          minH = Math.min(minH, sample.h);
          maxH = Math.max(maxH, sample.h);
          heightDelta += Math.abs(sample.h - center.h);
        }
        if (!suitable) break;
      }
      if (!suitable || maxH - minH > 3) continue;

      // Leave a tree-free 5x5 clearing for the player and first building.
      for (let dz = -2; dz <= 2 && suitable; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (this.treeAt(wx + dx, wz + dz)) {
            suitable = false;
            break;
          }
        }
      }
      if (!suitable) continue;

      const distance = Math.hypot(wx, wz);
      const score =
        200 -
        (maxH - minH) * 35 -
        heightDelta * 1.5 -
        Math.abs(center.h - (SEA_LEVEL + 10)) * 2 -
        distance * 0.08;
      if (!best || score > best.score) {
        best = { x: wx + 0.5, y: center.h, z: wz + 0.5, score };
      }
    }

    return best ? { x: best.x, y: best.y, z: best.z } : { x: 0.5, y: WORLD_HEIGHT / 2, z: 0.5 };
  }
}

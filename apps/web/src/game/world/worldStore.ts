import {
  CHUNK_SIZE,
  WORLD_HEIGHT,
  blockIndex,
  chunkCoord,
  chunkKey,
  localCoord,
  TerrainGenerator,
  type SignInfo,
} from '@eternal-blocks/shared';

export interface Chunk {
  cx: number;
  cz: number;
  blocks: Uint8Array;
}

export type SignMap = Map<string, SignInfo>;

/**
 * Client-side world state: deterministic terrain + server-authoritative
 * overrides + signs. Chunks generate on demand; overrides survive chunk
 * eviction so re-entering an area keeps player edits visible even between
 * server snapshots.
 */
export class WorldStore {
  readonly gen: TerrainGenerator;
  readonly chunks = new Map<string, Chunk>();
  /** chunkKey -> (flat block index -> block id). Authoritative edits. */
  readonly overridesByChunk = new Map<string, Map<number, number>>();
  /** blockKey -> sign data. */
  readonly signs: SignMap = new Map();
  private order: string[] = [];
  private readonly maxChunks = 900;

  constructor(seed: number) {
    this.gen = new TerrainGenerator(seed);
  }

  getChunk(cx: number, cz: number): Chunk {
    const key = chunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      const blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
      this.gen.fillChunk(blocks, cx, cz);
      // Apply persisted overrides for this chunk.
      const ov = this.overridesByChunk.get(key);
      if (ov) {
        for (const [idx, id] of ov) blocks[idx] = id;
      }
      chunk = { cx, cz, blocks };
      this.chunks.set(key, chunk);
      this.order.push(key);
      if (this.chunks.size > this.maxChunks) this.evictOldest();
    } else {
      // Refresh LRU position.
      const i = this.order.indexOf(key);
      if (i >= 0 && i !== this.order.length - 1) {
        this.order.splice(i, 1);
        this.order.push(key);
      }
    }
    return chunk;
  }

  peekChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cz));
  }

  private evictOldest(): void {
    while (this.order.length > this.maxChunks) {
      const key = this.order.shift()!;
      this.chunks.delete(key);
    }
  }

  /** Effective block at world coordinates (generates the chunk if needed). */
  getBlock(wx: number, wy: number, wz: number): number {
    if (wy < 0 || wy >= WORLD_HEIGHT) return 0;
    const chunk = this.getChunk(chunkCoord(wx), chunkCoord(wz));
    return chunk.blocks[blockIndex(localCoord(wx), wy, localCoord(wz))];
  }

  /**
   * Record an override (server snapshot or optimistic local edit) and apply
   * it to the loaded chunk immediately.
   */
  setOverride(wx: number, wy: number, wz: number, id: number): void {
    if (wy < 0 || wy >= WORLD_HEIGHT) return;
    const cx = chunkCoord(wx);
    const cz = chunkCoord(wz);
    const key = chunkKey(cx, cz);
    const idx = blockIndex(localCoord(wx), wy, localCoord(wz));
    let ov = this.overridesByChunk.get(key);
    if (!ov) {
      ov = new Map();
      this.overridesByChunk.set(key, ov);
    }
    ov.set(idx, id);
    const chunk = this.chunks.get(key);
    if (chunk) chunk.blocks[idx] = id;
  }

  /** Apply a full chunk snapshot from the server. */
  applySnapshot(
    cx: number,
    cz: number,
    overrides: Array<[number, number]>,
    signs: SignInfo[],
  ): void {
    const key = chunkKey(cx, cz);
    let ov = this.overridesByChunk.get(key);
    if (!ov) {
      ov = new Map();
      this.overridesByChunk.set(key, ov);
    } else {
      ov.clear();
    }
    for (const [idx, id] of overrides) ov.set(idx, id);
    const chunk = this.chunks.get(key);
    if (chunk) {
      // Re-apply from scratch: regenerate then overlay.
      this.gen.fillChunk(chunk.blocks, cx, cz);
      for (const [idx, id] of ov) chunk.blocks[idx] = id;
    }
    for (const s of signs) this.signs.set(`${s.x},${s.y},${s.z}`, s);
  }

  upsertSign(sign: SignInfo): void {
    this.signs.set(`${sign.x},${sign.y},${sign.z}`, sign);
  }

  removeSign(x: number, y: number, z: number): void {
    this.signs.delete(`${x},${y},${z}`);
  }

  /** Forget all server-provided deltas before a full resynchronization. */
  resetForResync(): void {
    this.overridesByChunk.clear();
    this.signs.clear();
    this.chunks.clear();
    this.order.length = 0;
  }

  /** Drop cached terrain data far from the player (overrides are kept). */
  pruneAround(pcx: number, pcz: number, radius: number): void {
    for (const key of [...this.chunks.keys()]) {
      const comma = key.indexOf(',');
      const cx = Number(key.slice(0, comma));
      const cz = Number(key.slice(comma + 1));
      if (Math.abs(cx - pcx) > radius + 2 || Math.abs(cz - pcz) > radius + 2) {
        this.chunks.delete(key);
        const i = this.order.indexOf(key);
        if (i >= 0) this.order.splice(i, 1);
      }
    }
  }
}

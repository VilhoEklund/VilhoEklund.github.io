import * as THREE from 'three';
import { CHUNK_SIZE, chunkCoord, chunkKey } from '@eternal-blocks/shared';
import { buildChunkGeometries } from './mesher.ts';
import type { WorldStore } from './worldStore.ts';

interface BuiltChunk {
  opaque?: THREE.Mesh;
  water?: THREE.Mesh;
}

export interface ChunkLoadProgress {
  done: number;
  total: number;
}

/**
 * Schedules chunk mesh building/unloading around the player with a per-frame
 * budget, and rebuilds edited chunks immediately.
 */
export class ChunkManager {
  readonly group = new THREE.Group();
  renderDistance: number;
  private built = new Map<string, BuiltChunk>();
  private queue: Array<{ key: string; cx: number; cz: number; dist: number }> = [];
  private queued = new Set<string>();
  private lastPlayerCx = Number.NaN;
  private lastPlayerCz = Number.NaN;
  private disposedGeometries = 0;

  constructor(
    private readonly world: WorldStore,
    private readonly materials: { opaque: THREE.Material; water: THREE.Material },
    private readonly shadowsEnabled: boolean,
    initialRenderDistance: number,
  ) {
    this.renderDistance = initialRenderDistance;
    this.group.name = 'chunks';
  }

  setRenderDistance(rd: number): void {
    if (rd === this.renderDistance) return;
    this.renderDistance = rd;
    this.lastPlayerCx = Number.NaN; // force desired-set refresh
  }

  /** True when the player crossed into a new chunk (or first update). */
  private refreshDesired(pcx: number, pcz: number): void {
    const rd = this.renderDistance;
    this.queue.length = 0;
    this.queued.clear();
    for (let dz = -rd; dz <= rd; dz++) {
      for (let dx = -rd; dx <= rd; dx++) {
        const dist = dx * dx + dz * dz;
        if (dist > rd * rd + rd) continue; // circular-ish selection
        const cx = pcx + dx;
        const cz = pcz + dz;
        const key = chunkKey(cx, cz);
        if (!this.built.has(key)) {
          this.queue.push({ key, cx, cz, dist });
          this.queued.add(key);
        }
      }
    }
    this.queue.sort((a, b) => a.dist - b.dist);
    // Unload far chunks.
    for (const [key, mesh] of [...this.built]) {
      const comma = key.indexOf(',');
      const cx = Number(key.slice(0, comma));
      const cz = Number(key.slice(comma + 1));
      if (Math.abs(cx - pcx) > rd + 1 || Math.abs(cz - pcz) > rd + 1) {
        this.disposeChunkMeshes(key, mesh);
        this.built.delete(key);
      }
    }
    this.world.pruneAround(pcx, pcz, rd);
  }

  private disposeChunkMeshes(key: string, mesh: BuiltChunk): void {
    for (const part of [mesh.opaque, mesh.water]) {
      if (!part) continue;
      this.group.remove(part);
      part.geometry.dispose();
      this.disposedGeometries++;
    }
    void key;
  }

  get disposedGeometryCount(): number {
    return this.disposedGeometries;
  }

  /** Rebuild one chunk now (used after edits). */
  rebuildNow(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    const existing = this.built.get(key);
    if (existing) this.disposeChunkMeshes(key, existing);
    this.buildChunk(cx, cz);
  }

  markDirtyAt(wx: number, wy: number, wz: number): void {
    void wy;
    const cx = chunkCoord(wx);
    const cz = chunkCoord(wz);
    this.rebuildIfBuilt(cx, cz);
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    if (lx === 0) this.rebuildIfBuilt(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.rebuildIfBuilt(cx + 1, cz);
    if (lz === 0) this.rebuildIfBuilt(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.rebuildIfBuilt(cx, cz + 1);
  }

  markAllForRebuild(): void {
    for (const [key, mesh] of [...this.built]) {
      const comma = key.indexOf(',');
      this.disposeChunkMeshes(key, mesh);
      this.buildChunk(Number(key.slice(0, comma)), Number(key.slice(comma + 1)));
    }
  }

  private rebuildIfBuilt(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    const existing = this.built.get(key);
    if (existing) this.rebuildNow(cx, cz);
  }

  private buildChunk(cx: number, cz: number): void {
    const { opaque, water } = buildChunkGeometries(this.world, cx, cz);
    const entry: BuiltChunk = {};
    if (opaque) {
      const mesh = new THREE.Mesh(opaque, this.materials.opaque);
      mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
      mesh.castShadow = this.shadowsEnabled;
      mesh.receiveShadow = this.shadowsEnabled;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.group.add(mesh);
      entry.opaque = mesh;
    }
    if (water) {
      const mesh = new THREE.Mesh(water, this.materials.water);
      mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
      mesh.receiveShadow = false;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.renderOrder = 2;
      this.group.add(mesh);
      entry.water = mesh;
    }
    const key = chunkKey(cx, cz);
    this.built.set(key, entry);
    this.queued.delete(key);
  }

  /**
   * Per-frame update: refresh desired set on chunk crossings, then build a
   * small budget of pending chunks nearest-first.
   */
  update(px: number, pz: number): void {
    const pcx = Math.floor(px) >> 4;
    const pcz = Math.floor(pz) >> 4;
    if (pcx !== this.lastPlayerCx || pcz !== this.lastPlayerCz) {
      this.lastPlayerCx = pcx;
      this.lastPlayerCz = pcz;
      this.refreshDesired(pcx, pcz);
    }
    let budget = this.built.size < 9 ? 6 : 2; // fast first load
    while (budget > 0 && this.queue.length > 0) {
      const next = this.queue.shift()!;
      if (this.built.has(next.key)) continue;
      // Skip chunks that fell out of range while queued.
      if (
        Math.abs(next.cx - this.lastPlayerCx) > this.renderDistance ||
        Math.abs(next.cz - this.lastPlayerCz) > this.renderDistance
      ) {
        continue;
      }
      this.buildChunk(next.cx, next.cz);
      budget--;
    }
  }

  progress(): ChunkLoadProgress {
    return { done: this.built.size, total: this.built.size + this.queue.length };
  }

  hasPendingInitialLoad(): boolean {
    return this.queue.length > 0;
  }

  dispose(): void {
    for (const [key, mesh] of this.built) this.disposeChunkMeshes(key, mesh);
    this.built.clear();
    this.queue.length = 0;
  }
}

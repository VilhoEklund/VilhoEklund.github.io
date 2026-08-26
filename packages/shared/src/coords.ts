import { CHUNK_SIZE, WORLD_HEIGHT } from './constants.ts';

/**
 * Coordinate helpers. All functions handle negative world coordinates
 * correctly (floor division via arithmetic shift; local part via bitmask).
 */

/** Chunk coordinate (floor division by CHUNK_SIZE) for any integer. */
export function chunkCoord(v: number): number {
  return v >> 4; // valid because CHUNK_SIZE === 16 === 2^4
}

/** Local coordinate inside a chunk (0..15) for any integer. */
export function localCoord(v: number): number {
  return v & 15;
}

/** Flat index of a block inside a chunk's Uint8Array. */
export function blockIndex(lx: number, y: number, lz: number): number {
  return lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
}

/** Inverse of {@link blockIndex}. */
export function indexToLocals(idx: number): { lx: number; y: number; lz: number } {
  const lx = idx & 15;
  const lz = (idx >> 4) & 15;
  const y = idx >> 8;
  return { lx, y, lz };
}

/** Stable string key for a chunk. */
export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

/** Parse a chunk key back into coordinates. */
export function parseChunkKey(key: string): { cx: number; cz: number } | null {
  const m = /^(-?\d+),(-?\d+)$/.exec(key);
  if (!m) return null;
  return { cx: Number(m[1]), cz: Number(m[2]) };
}

/** Stable string key for a world block position. */
export function blockKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export function isInWorldY(y: number): boolean {
  return Number.isInteger(y) && y >= 0 && y < WORLD_HEIGHT;
}

/** Squared distance from a player position to the center of a block cell. */
export function distanceSqToBlockCenter(
  px: number,
  py: number,
  pz: number,
  x: number,
  y: number,
  z: number,
): number {
  const dx = px - (x + 0.5);
  const dy = py - (y + 0.5);
  const dz = pz - (z + 0.5);
  return dx * dx + dy * dy + dz * dz;
}

/** Manhattan ring iterator helper used for spawn search. */
export function spiralOffsets(radius: number): Array<[number, number]> {
  const out: Array<[number, number]> = [[0, 0]];
  for (let r = 1; r <= radius; r++) {
    for (let x = -r; x <= r; x++) {
      out.push([x, -r], [x, r]);
    }
    for (let z = -r + 1; z <= r - 1; z++) {
      out.push([-r, z], [r, z]);
    }
  }
  return out;
}

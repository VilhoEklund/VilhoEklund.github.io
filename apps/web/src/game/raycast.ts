import { WORLD_HEIGHT, BlockId, isSolid } from '@eternal-blocks/shared';
import type { WorldStore } from './world/worldStore.ts';

export interface RayHit {
  /** Target block cell. */
  x: number;
  y: number;
  z: number;
  /** Face normal (points out of the hit block). */
  nx: number;
  ny: number;
  nz: number;
  dist: number;
}

/**
 * Voxel DDA raycast (Amanatides & Woo). Targets solid blocks and signs;
 * passes through air and water.
 */
export function raycastVoxel(
  world: WorldStore,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
): RayHit | null {
  const len = Math.hypot(dx, dy, dz);
  if (len === 0) return null;
  const rx = dx / len;
  const ry = dy / len;
  const rz = dz / len;

  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);

  const stepX = rx > 0 ? 1 : -1;
  const stepY = ry > 0 ? 1 : -1;
  const stepZ = rz > 0 ? 1 : -1;

  const tDeltaX = rx !== 0 ? Math.abs(1 / rx) : Number.POSITIVE_INFINITY;
  const tDeltaY = ry !== 0 ? Math.abs(1 / ry) : Number.POSITIVE_INFINITY;
  const tDeltaZ = rz !== 0 ? Math.abs(1 / rz) : Number.POSITIVE_INFINITY;

  let tMaxX = rx !== 0 ? ((rx > 0 ? x + 1 - ox : ox - x) || 1e-9) * tDeltaX : Number.POSITIVE_INFINITY;
  let tMaxY = ry !== 0 ? ((ry > 0 ? y + 1 - oy : oy - y) || 1e-9) * tDeltaY : Number.POSITIVE_INFINITY;
  let tMaxZ = rz !== 0 ? ((rz > 0 ? z + 1 - oz : oz - z) || 1e-9) * tDeltaZ : Number.POSITIVE_INFINITY;

  let nx = 0;
  let ny = 0;
  let nz = 0;
  let t = 0;

  // The starting cell itself can be a sign/solid when standing inside one.
  {
    const start = world.getBlock(x, y, z);
    if (start !== BlockId.Air && start !== BlockId.Water && isTargetable(start)) {
      return { x, y, z, nx: 0, ny: 1, nz: 0, dist: 0 };
    }
  }

  for (;;) {
    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        x += stepX;
        t = tMaxX;
        tMaxX += tDeltaX;
        nx = -stepX;
        ny = 0;
        nz = 0;
      } else {
        z += stepZ;
        t = tMaxZ;
        tMaxZ += tDeltaZ;
        nx = 0;
        ny = 0;
        nz = -stepZ;
      }
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
      nx = 0;
      ny = -stepY;
      nz = 0;
    } else {
      z += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      nx = 0;
      ny = 0;
      nz = -stepZ;
    }
    if (t > maxDist) return null;
    if (y < 0 || y >= WORLD_HEIGHT) return null; // nothing targetable outside the world column
    const b = world.getBlock(x, y, z);
    if (b !== BlockId.Air && b !== BlockId.Water && isTargetable(b)) {
      return { x, y, z, nx, ny, nz, dist: t };
    }
  }
}

function isTargetable(block: number): boolean {
  return isSolid(block) || block === BlockId.Sign;
}

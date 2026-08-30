import { WORLD_HEIGHT, BlockId, blockSelectionBoxes, type BlockBox } from '@eternal-blocks/shared';
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
  /** Exact world-space point where the ray entered the block shape. */
  hx: number;
  hy: number;
  hz: number;
}

/**
 * Voxel DDA raycast (Amanatides & Woo) with an exact AABB test inside each
 * visited cell. This lets rays pass through the empty half of slabs, stair
 * cut-outs, open doors, and ladder gaps instead of targeting their whole cell.
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

  let tMaxX =
    rx !== 0 ? ((rx > 0 ? x + 1 - ox : ox - x) || 1e-9) * tDeltaX : Number.POSITIVE_INFINITY;
  let tMaxY =
    ry !== 0 ? ((ry > 0 ? y + 1 - oy : oy - y) || 1e-9) * tDeltaY : Number.POSITIVE_INFINITY;
  let tMaxZ =
    rz !== 0 ? ((rz > 0 ? z + 1 - oz : oz - z) || 1e-9) * tDeltaZ : Number.POSITIVE_INFINITY;

  let entryT = 0;
  for (;;) {
    const exitT = Math.min(tMaxX, tMaxY, tMaxZ, maxDist);
    if (y >= 0 && y < WORLD_HEIGHT) {
      const block = world.getBlock(x, y, z);
      if (block !== BlockId.Air && block !== BlockId.Water) {
        const boxes = block === BlockId.Sign ? [FULL_BOX] : blockSelectionBoxes(block);
        let nearest: BoxHit | null = null;
        for (const box of boxes) {
          const hit = rayBox(
            ox,
            oy,
            oz,
            rx,
            ry,
            rz,
            {
              ...box,
              minX: box.minX + x,
              maxX: box.maxX + x,
              minY: box.minY + y,
              maxY: box.maxY + y,
              minZ: box.minZ + z,
              maxZ: box.maxZ + z,
            },
            maxDist,
          );
          if (hit && hit.dist + 1e-7 >= entryT && hit.dist <= exitT + 1e-7) {
            if (!nearest || hit.dist < nearest.dist) nearest = hit;
          }
        }
        if (nearest) {
          return {
            x,
            y,
            z,
            nx: nearest.nx,
            ny: nearest.ny,
            nz: nearest.nz,
            dist: nearest.dist,
            hx: ox + rx * nearest.dist,
            hy: oy + ry * nearest.dist,
            hz: oz + rz * nearest.dist,
          };
        }
      }
    }
    if (exitT >= maxDist || !Number.isFinite(exitT)) return null;

    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        x += stepX;
        entryT = tMaxX;
        tMaxX += tDeltaX;
      } else {
        z += stepZ;
        entryT = tMaxZ;
        tMaxZ += tDeltaZ;
      }
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      entryT = tMaxY;
      tMaxY += tDeltaY;
    } else {
      z += stepZ;
      entryT = tMaxZ;
      tMaxZ += tDeltaZ;
    }
  }
}

const FULL_BOX: BlockBox = {
  minX: 0,
  minY: 0,
  minZ: 0,
  maxX: 1,
  maxY: 1,
  maxZ: 1,
};

interface BoxHit {
  dist: number;
  nx: number;
  ny: number;
  nz: number;
}

function rayBox(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  box: BlockBox,
  maxDist: number,
): BoxHit | null {
  let near = 0;
  let far = maxDist;
  let nx = 0;
  let ny = 1;
  let nz = 0;
  const origins = [ox, oy, oz];
  const dirs = [dx, dy, dz];
  const mins = [box.minX, box.minY, box.minZ];
  const maxs = [box.maxX, box.maxY, box.maxZ];
  for (let axis = 0; axis < 3; axis++) {
    const direction = dirs[axis];
    const origin = origins[axis];
    if (Math.abs(direction) < 1e-12) {
      if (origin < mins[axis] || origin > maxs[axis]) return null;
      continue;
    }
    let a = (mins[axis] - origin) / direction;
    let b = (maxs[axis] - origin) / direction;
    let normalSign = -1;
    if (a > b) {
      [a, b] = [b, a];
      normalSign = 1;
    }
    if (a > near) {
      near = a;
      nx = axis === 0 ? normalSign : 0;
      ny = axis === 1 ? normalSign : 0;
      nz = axis === 2 ? normalSign : 0;
    }
    far = Math.min(far, b);
    if (near > far) return null;
  }
  if (far < 0 || near > maxDist) return null;
  return { dist: Math.max(0, near), nx, ny, nz };
}

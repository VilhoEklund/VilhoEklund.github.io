import { describe, expect, it } from 'vitest';
import { BlockId, CHUNK_SIZE } from '@eternal-blocks/shared';
import { playerIntersectsBlock } from '../src/game/player.ts';
import { raycastVoxel } from '../src/game/raycast.ts';
import { buildChunkGeometries } from '../src/game/world/mesher.ts';
import { WorldStore } from '../src/game/world/worldStore.ts';
import { BLOCK_TILES } from '../src/game/textures.ts';

describe('shaped blocks in the client', () => {
  it('has atlas tiles for every new state, including both halves of an open door', () => {
    for (let id = BlockId.WhiteWool; id <= BlockId.DoorTopOpenWest; id++) {
      expect(BLOCK_TILES[id], `missing texture mapping for block ${id}`).toBeDefined();
    }
  });

  it('raycasts the physical half of a slab and passes through its empty half', () => {
    const world = new WorldStore(2026);
    world.setOverride(1, 70, 0, BlockId.OakSlabBottom);
    world.setOverride(2, 70, 0, BlockId.Stone);

    const low = raycastVoxel(world, 0.5, 70.25, 0.5, 1, 0, 0, 5);
    expect(low).toMatchObject({ x: 1, y: 70, z: 0, nx: -1, dist: 0.5 });
    expect(low?.hy).toBeCloseTo(70.25);

    const high = raycastVoxel(world, 0.5, 70.75, 0.5, 1, 0, 0, 5);
    expect(high).toMatchObject({ x: 2, y: 70, z: 0, nx: -1, dist: 1.5 });
  });

  it('uses exact placement collision instead of treating shaped blocks as cubes', () => {
    expect(playerIntersectsBlock(0.5, 10.51, 0.5, 0, 10, 0, BlockId.OakSlabBottom)).toBe(false);
    expect(playerIntersectsBlock(0.5, 10.49, 0.5, 0, 10, 0, BlockId.OakSlabBottom)).toBe(true);
    expect(playerIntersectsBlock(0.5, 10, 0.5, 0, 10, 0, BlockId.DoorBottomClosedNorth)).toBe(
      false,
    );
    expect(playerIntersectsBlock(0.5, 10, 0.1, 0, 10, 0, BlockId.DoorBottomClosedNorth)).toBe(true);
  });

  it('meshes a slab at exactly half block height', () => {
    const world = new WorldStore(3030);
    const bx = 5;
    const bz = 5;
    world.setOverride(bx, 70, bz, BlockId.BrickSlabBottom);
    const geo = buildChunkGeometries(world, 0, 0).opaque!;
    const positions = geo.getAttribute('position');
    const ys: number[] = [];
    const lx = ((bx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((bz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      if (x >= lx && x <= lx + 1 && z >= lz && z <= lz + 1 && y >= 70 && y <= 71) ys.push(y);
    }
    expect(ys.length).toBeGreaterThan(0);
    expect(Math.max(...ys)).toBe(70.5);
  });
});

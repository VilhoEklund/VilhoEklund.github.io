import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CHUNK_SIZE, WORLD_HEIGHT } from '@eternal-blocks/shared';
import { buildChunkGeometries } from '../src/game/world/mesher.ts';
import { WorldStore } from '../src/game/world/worldStore.ts';

function quadCount(geo: THREE.BufferGeometry): number {
  return geo.index!.count / 6;
}

describe('chunk mesher', () => {
  it('produces merged geometry with hidden faces culled (far fewer than 6 faces per block)', () => {
    const world = new WorldStore(2024);
    const { opaque } = buildChunkGeometries(world, 0, 0);
    expect(opaque).not.toBeNull();
    const quads = quadCount(opaque!);
    const blocks = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;
    // A solid world would emit ~6 faces per block if unculled; terrain
    // surface chunks must stay far below that.
    expect(quads).toBeGreaterThan(50);
    expect(quads).toBeLessThan(blocks / 4);
    // Attributes are consistent.
    expect(opaque!.getAttribute('position').count).toBe(quads * 4);
    expect(opaque!.getAttribute('color').count).toBe(quads * 4);
    expect(opaque!.getAttribute('uv').count).toBe(quads * 4);
  });

  it('is deterministic for the same chunk', () => {
    const a = new WorldStore(99);
    const b = new WorldStore(99);
    const ga = buildChunkGeometries(a, -3, -3);
    const gb = buildChunkGeometries(b, -3, -3);
    const pa = ga.opaque!.getAttribute('position').array as Float32Array;
    const pb = gb.opaque!.getAttribute('position').array as Float32Array;
    expect(pa.length).toBe(pb.length);
    expect(Array.from(pa)).toEqual(Array.from(pb));
  });

  it('renders water as separate translucent geometry where the sea is', () => {
    const world = new WorldStore(4242);
    let sawWater = false;
    outer: for (let cz = -6; cz <= 6; cz++) {
      for (let cx = -6; cx <= 6; cx++) {
        const { water } = buildChunkGeometries(world, cx, cz);
        if (water) {
          sawWater = true;
          expect(water.getAttribute('position').count % 4).toBe(0);
          break outer;
        }
      }
    }
    expect(sawWater).toBe(true);
  });

  it('emits exactly the exposed shell for an isolated placed structure (interior faces culled)', () => {
    const world = new WorldStore(5150);
    const sp = world.gen.findSpawn();
    // A vertical 1x3 column high above any terrain/tree canopy.
    const y0 = 62;
    const bx = Math.floor(sp.x) + 7;
    const bz = Math.floor(sp.z) + 7;
    for (let dy = 0; dy < 3; dy++) world.setOverride(bx, y0 + dy, bz, 9);

    const cx = Math.floor(bx / CHUNK_SIZE);
    const cz = Math.floor(bz / CHUNK_SIZE);
    const { opaque } = buildChunkGeometries(world, cx, cz);
    expect(opaque).not.toBeNull();

    // Quads whose first corner lies inside the column volume.
    const lx = ((bx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((bz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const pos = opaque!.getAttribute('position');
    let columnQuads = 0;
    for (let i = 0; i < pos.count; i += 4) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (x >= lx && x <= lx + 1 && z >= lz && z <= lz + 1 && y >= y0 && y <= y0 + 3) columnQuads++;
    }
    // 3 stacked cubes: 18 raw faces - 2 per shared boundary (x2) = 14 shell quads.
    expect(columnQuads).toBe(14);
  });
});

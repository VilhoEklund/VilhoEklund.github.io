import { describe, expect, it } from 'vitest';
import { buildChunkGeometries } from '../src/game/world/mesher.ts';
import { WorldStore } from '../src/game/world/worldStore.ts';

/**
 * Regression guard for chunk triangle winding.
 *
 * Every emitted triangle's geometric normal (derived from its index winding)
 * must agree with the stored per-vertex face normal. The mesher flips quad
 * diagonals for ambient-occlusion interpolation; a flip that reverses winding
 * makes the GPU backface-cull those quads, which shows up in-game as missing
 * faces / texture glitch patches scattered across the terrain.
 */

function invertedTriangleCount(geo: THREE.BufferGeometry): number {
  const pos = geo.getAttribute('position');
  const nrm = geo.getAttribute('normal');
  const idx = geo.getIndex();
  if (!idx) return 0;
  let bad = 0;
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t);
    const b = idx.getX(t + 1);
    const c = idx.getX(t + 2);
    const e1 = [pos.getX(b) - pos.getX(a), pos.getY(b) - pos.getY(a), pos.getZ(b) - pos.getZ(a)];
    const e2 = [pos.getX(c) - pos.getX(a), pos.getY(c) - pos.getY(a), pos.getZ(c) - pos.getZ(a)];
    const n = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const len = Math.hypot(n[0], n[1], n[2]);
    if (len === 0) continue;
    const dot = (n[0] * nrm.getX(a) + n[1] * nrm.getY(a) + n[2] * nrm.getZ(a)) / len;
    if (dot < 0) bad++;
  }
  return bad;
}

describe('mesher triangle winding', () => {
  it('winds every triangle against its face normal (both AO diagonal branches)', () => {
    for (const seed of [77, 123]) {
      const world = new WorldStore(seed);
      const { opaque, water } = buildChunkGeometries(world, 0, 0);
      expect(opaque, 'opaque geometry exists').not.toBeNull();
      // The natural terrain chunk must exercise both triangulation branches.
      expect(invertedTriangleCount(opaque!), `seed=${seed} opaque`).toBe(0);
      if (water) expect(invertedTriangleCount(water), `seed=${seed} water`).toBe(0);
    }
  });

  it('flipped-diagonal quads keep the same winding as default quads', () => {
    // Force both branches on a single block: an open block uses the default
    // branch; surrounding it with neighbors creates the AO gradient that
    // triggers the flipped branch. Winding must stay consistent either way.
    const world = new WorldStore(77);
    world.setOverride(8, 62, 8, 1); // solid center block
    world.setOverride(7, 61, 8, 1); // neighbor below-left raises corner AO
    const { opaque } = buildChunkGeometries(world, 0, 0);
    expect(opaque).not.toBeNull();
    expect(invertedTriangleCount(opaque!)).toBe(0);
  });
});

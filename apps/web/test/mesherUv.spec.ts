import { describe, expect, it } from 'vitest';
import { BLOCKS, BlockId } from '@eternal-blocks/shared';
import { buildChunkGeometries } from '../src/game/world/mesher.ts';
import { WorldStore } from '../src/game/world/worldStore.ts';
import { BLOCK_TILES, tileUVRect } from '../src/game/textures.ts';

/**
 * Regression guard for chunk UV mapping.
 *
 * Every face quad must sample strictly inside its own tile's atlas rect
 * (top -> tiles[0], bottom -> tiles[2], sides -> tiles[1]) and neither UV
 * axis may be collapsed to a constant (which would stretch one texel row or
 * column across the whole face).
 */

const Y0 = 62;
const CELL = { x: 8, z: 8 };

interface Quad {
  u: number[];
  v: number[];
  /** Face normal from vertex winding position deltas. */
}

function classifyFace(world: WorldStore, id: number): Array<{ quad: Quad; kind: 'top' | 'bottom' | 'side' }> {
  world.setOverride(CELL.x, Y0, CELL.z, id);
  const { opaque, water } = buildChunkGeometries(world, 0, 0);
  const geo = id === BlockId.Water ? water! : opaque!;
  const pos = geo.getAttribute('position');
  const out: Array<{ quad: Quad; kind: 'top' | 'bottom' | 'side' }> = [];
  for (let i = 0; i < pos.count; i += 4) {
    let inside = false;
    for (let k = 0; k < 4; k++) {
      if (
        pos.getX(i + k) >= CELL.x && pos.getX(i + k) <= CELL.x + 1 &&
        pos.getZ(i + k) >= CELL.z && pos.getZ(i + k) <= CELL.z + 1 &&
        pos.getY(i + k) >= Y0 && pos.getY(i + k) <= Y0 + 1
      ) inside = true;
    }
    if (!inside) continue;
    const ys = [0, 1, 2, 3].map((k) => pos.getY(i + k));
    const allTop = ys.every((y) => y > Y0 + 1 - 0.2);
    const allBottom = ys.every((y) => y < Y0 + 0.2);
    const kind = allTop ? 'top' : allBottom ? 'bottom' : 'side';
    const u: number[] = [];
    const v: number[] = [];
    const uv = geo.getAttribute('uv');
    for (let k = 0; k < 4; k++) {
      u.push(uv.getX(i + k));
      v.push(uv.getY(i + k));
    }
    out.push({ quad: { u, v }, kind });
  }
  return out;
}

describe('mesher uv mapping', () => {
  it('samples each face inside its own tile rect with no collapsed axis', () => {
    const ids = [
      BlockId.Grass,
      BlockId.Dirt,
      BlockId.Stone,
      BlockId.Sand,
      BlockId.Log,
      BlockId.Leaves,
      BlockId.Planks,
      BlockId.Brick,
      BlockId.Glass,
      BlockId.Snow,
      BlockId.Bedrock,
      BlockId.Water,
    ];
    for (const id of ids) {
      const name = BLOCKS[id]?.name ?? String(id);
      const world = new WorldStore(77);
      const faces = classifyFace(world, id);
      expect(faces.length, `${name}: exposed faces`).toBeGreaterThan(0);

      for (const { quad, kind } of faces) {
        const tiles = BLOCK_TILES[id];
        const tile = kind === 'top' ? tiles[0] : kind === 'bottom' ? tiles[2] : tiles[1];
        const [u0, v0, u1, v1] = tileUVRect(tile);

        const umin = Math.min(...quad.u);
        const umax = Math.max(...quad.u);
        const vmin = Math.min(...quad.v);
        const vmax = Math.max(...quad.v);

        expect(
          umin >= u0 - 1e-6 && umax <= u1 + 1e-6 && vmin >= v0 - 1e-6 && vmax <= v1 + 1e-6,
          `${name} ${kind} face must sample ${tile} rect [${u0},${u1}]x[${v0},${v1}], got u[${umin},${umax}] v[${vmin},${vmax}]`,
        ).toBe(true);

        // Side/top faces of a unit cube always have both axes spanning.
        expect(umax - umin, `${name} ${kind} u span collapsed`).toBeGreaterThan(0.01);
        expect(vmax - vmin, `${name} ${kind} v span collapsed`).toBeGreaterThan(0.01);
      }
    }
  });

  it('grass side texture is upright (fringe pixels at the top edge)', () => {
    // grass_side tile occupies v[v0,v1]; upper corners (world y=1) must map to v1 (top of tile).
    const world = new WorldStore(77);
    const faces = classifyFace(world, BlockId.Grass).filter((f) => f.kind === 'side');
    expect(faces.length).toBeGreaterThanOrEqual(2);
    for (const { quad } of faces) {
      const [, , , v1] = tileUVRect('grass_side');
      // At least two corners (the upper pair) sit at v1.
      const atTop = quad.v.filter((v) => Math.abs(v - v1) < 1e-6).length;
      expect(atTop, `grass side corners at tile top: ${quad.v.join(',')}`).toBe(2);
    }
  });
});

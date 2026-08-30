import * as THREE from 'three';
import { CHUNK_SIZE, WORLD_HEIGHT, blockIndex } from '@eternal-blocks/shared';
import {
  BLOCKS,
  BlockId,
  blockSelectionBoxes,
  isFullCube,
  type BlockBox,
} from '@eternal-blocks/shared';
import { BLOCK_TILES, tileUVRect, type TileName } from '../textures.ts';
import type { WorldStore } from './worldStore.ts';

/**
 * Chunk mesher.
 *
 * Builds one merged BufferGeometry per chunk (plus an optional translucent
 * water geometry) with hidden-face culling and baked ambient occlusion in
 * vertex colors. Only visible faces between non-opaque neighbors are emitted,
 * so a typical surface chunk is a few hundred quads instead of 20k cubes.
 */

interface FaceDef {
  dir: [number, number, number];
  /** Quad corners relative to block origin, order matching indices [0,1,2, 2,1,3]. */
  corners: Array<[number, number, number]>;
  /** Directional light fake: per-face brightness multiplier. */
  shade: number;
  /** Tangent axes used for AO sampling (0=x, 1=y, 2=z). */
  tangents: [number, number];
}

const FACES: FaceDef[] = [
  {
    // -x
    dir: [-1, 0, 0],
    corners: [
      [0, 1, 0],
      [0, 0, 0],
      [0, 1, 1],
      [0, 0, 1],
    ],
    shade: 0.72,
    tangents: [1, 2],
  },
  {
    // +x
    dir: [1, 0, 0],
    corners: [
      [1, 1, 1],
      [1, 0, 1],
      [1, 1, 0],
      [1, 0, 0],
    ],
    shade: 0.72,
    tangents: [1, 2],
  },
  {
    // -y
    dir: [0, -1, 0],
    corners: [
      [1, 0, 1],
      [0, 0, 1],
      [1, 0, 0],
      [0, 0, 0],
    ],
    shade: 0.5,
    tangents: [0, 2],
  },
  {
    // +y
    dir: [0, 1, 0],
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [0, 1, 0],
      [1, 1, 0],
    ],
    shade: 1.0,
    tangents: [0, 2],
  },
  {
    // -z
    dir: [0, 0, -1],
    corners: [
      [1, 0, 0],
      [0, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
    ],
    shade: 0.84,
    tangents: [0, 1],
  },
  {
    // +z
    dir: [0, 0, 1],
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [0, 1, 1],
      [1, 1, 1],
    ],
    shade: 0.84,
    tangents: [0, 1],
  },
];

const AO_LUT = [0.42, 0.62, 0.8, 1.0];

class MeshBuilder {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  colors: number[] = [];
  indices: number[] = [];

  quad(
    ox: number,
    oy: number,
    oz: number,
    face: FaceDef,
    tile: TileName,
    ao: [number, number, number, number],
    yTopOffset = 0,
  ): void {
    const [u0, v0, u1, v1] = tileUVRect(tile);
    const base = this.positions.length / 3;
    const uvFor = (ci: number): [number, number] => {
      const c = face.corners[ci];
      // Side faces: the horizontal UV axis is z on x-faces and x on z-faces;
      // v follows world-up so textures like grass_side stay upright.
      if (face.dir[1] === 0) {
        const horiz = face.dir[0] !== 0 ? c[2] : c[0];
        return [horiz === 1 ? u1 : u0, c[1] === 1 ? v1 : v0];
      }
      // Top/bottom faces: planar map x -> u, z -> v.
      return [c[0] === 1 ? u1 : u0, c[2] === 1 ? v1 : v0];
    };
    for (let ci = 0; ci < 4; ci++) {
      const c = face.corners[ci];
      const py = c[1] === 1 ? oy + c[1] + yTopOffset : oy + c[1];
      this.positions.push(ox + c[0], py, oz + c[2]);
      this.normals.push(face.dir[0], face.dir[1], face.dir[2]);
      const [uu, vv] = uvFor(ci);
      this.uvs.push(uu, vv);
      const b = AO_LUT[Math.min(3, Math.max(0, ao[ci]))] * face.shade;
      this.colors.push(b, b, b);
    }
    // Flip the shared diagonal toward the brighter pair to avoid AO artifacts.
    // Both branches must preserve counter-clockwise winding: the default
    // triangulation (0,1,2)(2,1,3) uses diagonal 1-2; the flipped one uses
    // diagonal 0-3 via (0,1,3)(0,3,2).
    if (ao[0] + ao[3] > ao[1] + ao[2]) {
      this.indices.push(base, base + 1, base + 3, base, base + 3, base + 2);
    } else {
      this.indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    }
  }

  /** Emit one face of a block-local shaped box. */
  boxQuad(ox: number, oy: number, oz: number, box: BlockBox, face: FaceDef, tile: TileName): void {
    const [u0, v0, u1, v1] = tileUVRect(tile);
    const base = this.positions.length / 3;
    for (let ci = 0; ci < 4; ci++) {
      const c = face.corners[ci];
      const px = c[0] === 0 ? box.minX : box.maxX;
      const py = c[1] === 0 ? box.minY : box.maxY;
      const pz = c[2] === 0 ? box.minZ : box.maxZ;
      this.positions.push(ox + px, oy + py, oz + pz);
      this.normals.push(face.dir[0], face.dir[1], face.dir[2]);
      if (face.dir[1] === 0) {
        const horiz = face.dir[0] !== 0 ? c[2] : c[0];
        this.uvs.push(horiz === 1 ? u1 : u0, c[1] === 1 ? v1 : v0);
      } else {
        this.uvs.push(c[0] === 1 ? u1 : u0, c[2] === 1 ? v1 : v0);
      }
      this.colors.push(face.shade, face.shade, face.shade);
    }
    this.indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
  }

  build(): THREE.BufferGeometry | null {
    if (this.indices.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.setIndex(this.indices);
    g.computeBoundingSphere();
    return g;
  }
}

export interface ChunkGeometries {
  opaque: THREE.BufferGeometry | null;
  water: THREE.BufferGeometry | null;
}

function shouldDrawFace(self: number, neighbor: number): boolean {
  if (neighbor === BlockId.Air) return true;
  const nd = BLOCKS[neighbor];
  if (!nd) return true;
  if (nd.opaque) return false;
  if (neighbor === self) return false; // merge same transparent types (glass-glass, water-water)
  if (self === BlockId.Water) return false; // water renders only against air
  return true;
}

const BOX_EPSILON = 1e-7;

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= BOX_EPSILON;
}

/** True when another box in the same shaped block completely covers this face. */
function boxFaceCovered(box: BlockBox, face: FaceDef, other: BlockBox): boolean {
  if (face.dir[0] < 0) {
    return (
      nearlyEqual(other.maxX, box.minX) &&
      other.minY <= box.minY &&
      other.maxY >= box.maxY &&
      other.minZ <= box.minZ &&
      other.maxZ >= box.maxZ
    );
  }
  if (face.dir[0] > 0) {
    return (
      nearlyEqual(other.minX, box.maxX) &&
      other.minY <= box.minY &&
      other.maxY >= box.maxY &&
      other.minZ <= box.minZ &&
      other.maxZ >= box.maxZ
    );
  }
  if (face.dir[1] < 0) {
    return (
      nearlyEqual(other.maxY, box.minY) &&
      other.minX <= box.minX &&
      other.maxX >= box.maxX &&
      other.minZ <= box.minZ &&
      other.maxZ >= box.maxZ
    );
  }
  if (face.dir[1] > 0) {
    return (
      nearlyEqual(other.minY, box.maxY) &&
      other.minX <= box.minX &&
      other.maxX >= box.maxX &&
      other.minZ <= box.minZ &&
      other.maxZ >= box.maxZ
    );
  }
  if (face.dir[2] < 0) {
    return (
      nearlyEqual(other.maxZ, box.minZ) &&
      other.minX <= box.minX &&
      other.maxX >= box.maxX &&
      other.minY <= box.minY &&
      other.maxY >= box.maxY
    );
  }
  return (
    nearlyEqual(other.minZ, box.maxZ) &&
    other.minX <= box.minX &&
    other.maxX >= box.maxX &&
    other.minY <= box.minY &&
    other.maxY >= box.maxY
  );
}

function faceTouchesCellBoundary(box: BlockBox, face: FaceDef): boolean {
  if (face.dir[0] < 0) return nearlyEqual(box.minX, 0);
  if (face.dir[0] > 0) return nearlyEqual(box.maxX, 1);
  if (face.dir[1] < 0) return nearlyEqual(box.minY, 0);
  if (face.dir[1] > 0) return nearlyEqual(box.maxY, 1);
  if (face.dir[2] < 0) return nearlyEqual(box.minZ, 0);
  return nearlyEqual(box.maxZ, 1);
}

/** Build render geometry for one chunk (generates neighbor data as needed). */
export function buildChunkGeometries(world: WorldStore, cx: number, cz: number): ChunkGeometries {
  const chunk = world.getChunk(cx, cz);
  const solid = new MeshBuilder();
  const water = new MeshBuilder();
  const blocks = chunk.blocks;
  const baseX = cx * CHUNK_SIZE;
  const baseZ = cz * CHUNK_SIZE;

  // Neighbor lookup that reads through the world store across borders.
  const at = (lx: number, y: number, lz: number): number => {
    if (y < 0 || y >= WORLD_HEIGHT) return BlockId.Air;
    if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
      return blocks[blockIndex(lx, y, lz)];
    }
    return world.getBlock(baseX + lx, y, baseZ + lz);
  };

  const opaqueAt = (lx: number, y: number, lz: number): boolean => {
    const b = at(lx, y, lz);
    return b !== BlockId.Air && (BLOCKS[b]?.opaque ?? false);
  };

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const self = blocks[blockIndex(lx, y, lz)];
        if (self === BlockId.Air || self === BlockId.Sign) continue;
        const tiles = BLOCK_TILES[self];
        if (!tiles) continue;

        const isWater = self === BlockId.Water;
        const builder = isWater ? water : solid;

        if (!isWater && !isFullCube(self)) {
          const boxes = blockSelectionBoxes(self);
          boxes.forEach((box, boxIndex) => {
            for (const face of FACES) {
              if (
                boxes.some(
                  (other, otherIndex) =>
                    otherIndex !== boxIndex && boxFaceCovered(box, face, other),
                )
              ) {
                continue;
              }
              if (faceTouchesCellBoundary(box, face)) {
                const neighbor = at(lx + face.dir[0], y + face.dir[1], lz + face.dir[2]);
                if (BLOCKS[neighbor]?.opaque) continue;
              }
              const tile = face.dir[1] === 1 ? tiles[0] : face.dir[1] === -1 ? tiles[2] : tiles[1];
              builder.boxQuad(lx, y, lz, box, face, tile);
            }
          });
          continue;
        }

        for (const face of FACES) {
          const nx = lx + face.dir[0];
          const ny = y + face.dir[1];
          const nz = lz + face.dir[2];
          const nb = at(nx, ny, nz);
          if (!shouldDrawFace(self, nb)) continue;

          const tile = face.dir[1] === 1 ? tiles[0] : face.dir[1] === -1 ? tiles[2] : tiles[1];

          if (isWater) {
            // Water: skip AO, lower the top surface slightly for a liquid look.
            const loweredTop = face.dir[1] === 1 ? -0.14 : 0;
            const mb = builder;
            const [u0, v0, u1, v1] = tileUVRect(tile);
            const startIdx = mb.positions.length / 3;
            for (let ci = 0; ci < 4; ci++) {
              const c = face.corners[ci];
              const py = c[1] === 1 ? y + c[1] + loweredTop : y + c[1];
              mb.positions.push(lx + c[0], py, lz + c[2]);
              mb.normals.push(face.dir[0], face.dir[1], face.dir[2]);
              const horiz = face.dir[1] === 0 ? (face.dir[0] !== 0 ? c[2] : c[0]) : c[0];
              const vert = face.dir[1] === 0 ? c[1] : c[2];
              mb.uvs.push(horiz === 1 ? u1 : u0, vert === 1 ? v1 : v0);
              const b = 0.95 * face.shade;
              mb.colors.push(b, b, b);
            }
            mb.indices.push(
              startIdx,
              startIdx + 1,
              startIdx + 2,
              startIdx + 2,
              startIdx + 1,
              startIdx + 3,
            );
            continue;
          }

          // Ambient occlusion per corner.
          const ao: [number, number, number, number] = [3, 3, 3, 3];
          for (let ci = 0; ci < 4; ci++) {
            const c = face.corners[ci];
            const [t1, t2] = face.tangents;
            const off = [face.dir[0], face.dir[1], face.dir[2]];
            const d1 = [0, 0, 0];
            d1[t1] = c[t1] * 2 - 1;
            const d2 = [0, 0, 0];
            d2[t2] = c[t2] * 2 - 1;
            const s1 = opaqueAt(nx + d1[0], ny + d1[1], nz + d1[2]) ? 1 : 0;
            const s2 = opaqueAt(nx + d2[0], ny + d2[1], nz + d2[2]) ? 1 : 0;
            const cnr = opaqueAt(nx + d1[0] + d2[0], ny + d1[1] + d2[1], nz + d1[2] + d2[2])
              ? 1
              : 0;
            ao[ci] = s1 && s2 ? 0 : 3 - (s1 + s2 + cnr);
            void off;
          }

          builder.quad(lx, y, lz, face, tile, ao);
        }
      }
    }
  }

  return { opaque: solid.build(), water: water.build() };
}

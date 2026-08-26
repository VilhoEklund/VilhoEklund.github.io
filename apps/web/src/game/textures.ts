import * as THREE from 'three';
import { BlockId } from '@eternal-blocks/shared';
import { hashString, mulberry32 } from '@eternal-blocks/shared';

/**
 * Original procedural block textures, painted once at startup into a single
 * atlas canvas. No external assets; deterministic per tile name.
 */

export const TILE_PX = 16;
export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 4;

export type TileName =
  | 'grass_top'
  | 'grass_side'
  | 'dirt'
  | 'stone'
  | 'sand'
  | 'water'
  | 'log_side'
  | 'log_top'
  | 'leaves'
  | 'planks'
  | 'brick'
  | 'glass'
  | 'bedrock'
  | 'sign';

export const TILE_INDEX: Record<TileName, number> = {
  grass_top: 0,
  grass_side: 1,
  dirt: 2,
  stone: 3,
  sand: 4,
  water: 5,
  log_side: 6,
  log_top: 7,
  leaves: 8,
  planks: 9,
  brick: 10,
  glass: 11,
  bedrock: 13,
  sign: 14,
};

/** [topTile, sideTile, bottomTile] per block id. */
export const BLOCK_TILES: Record<number, [TileName, TileName, TileName]> = {
  [BlockId.Grass]: ['grass_top', 'grass_side', 'dirt'],
  [BlockId.Dirt]: ['dirt', 'dirt', 'dirt'],
  [BlockId.Stone]: ['stone', 'stone', 'stone'],
  [BlockId.Sand]: ['sand', 'sand', 'sand'],
  [BlockId.Water]: ['water', 'water', 'water'],
  [BlockId.Log]: ['log_top', 'log_side', 'log_top'],
  [BlockId.Leaves]: ['leaves', 'leaves', 'leaves'],
  [BlockId.Planks]: ['planks', 'planks', 'planks'],
  [BlockId.Brick]: ['brick', 'brick', 'brick'],
  [BlockId.Glass]: ['glass', 'glass', 'glass'],
  [BlockId.Bedrock]: ['bedrock', 'bedrock', 'bedrock'],
  [BlockId.Sign]: ['sign', 'sign', 'sign'],
};

type RGB = [number, number, number];

function shade(c: RGB, f: number): RGB {
  return [
    Math.max(0, Math.min(255, Math.round(c[0] * f))),
    Math.max(0, Math.min(255, Math.round(c[1] * f))),
    Math.max(0, Math.min(255, Math.round(c[2] * f))),
  ];
}

interface PainterCtx {
  data: Uint8ClampedArray;
  size: number;
  rng: () => number;
}

function setPx(ctx: PainterCtx, x: number, y: number, c: RGB, a = 255): void {
  if (x < 0 || y < 0 || x >= ctx.size || y >= ctx.size) return;
  const i = (y * ctx.size + x) * 4;
  ctx.data[i] = c[0];
  ctx.data[i + 1] = c[1];
  ctx.data[i + 2] = c[2];
  ctx.data[i + 3] = a;
}

function fillNoise(ctx: PainterCtx, base: RGB, vary: number, alpha = 255): void {
  for (let y = 0; y < ctx.size; y++) {
    for (let x = 0; x < ctx.size; x++) {
      const f = 1 + (ctx.rng() - 0.5) * 2 * vary;
      setPx(ctx, x, y, shade(base, f), alpha);
    }
  }
}

function speckle(ctx: PainterCtx, color: RGB, count: number, alpha = 255): void {
  for (let i = 0; i < count; i++) {
    const x = Math.floor(ctx.rng() * ctx.size);
    const y = Math.floor(ctx.rng() * ctx.size);
    setPx(ctx, x, y, color, alpha);
  }
}

const PAINTERS: Record<TileName, (ctx: PainterCtx) => void> = {
  grass_top: ({ data, size, rng }) => {
    const c: PainterCtx = { data, size, rng };
    fillNoise(c, [88, 176, 74], 0.1);
    speckle(c, [64, 140, 56], 26);
    speckle(c, [120, 200, 96], 18);
  },
  grass_side: ({ data, size, rng }) => {
    const c: PainterCtx = { data, size, rng };
    fillNoise(c, [122, 86, 54], 0.12);
    speckle(c, [94, 66, 40], 20);
    // Grass fringe on top with a ragged edge.
    for (let x = 0; x < size; x++) {
      const depth = 3 + Math.floor(rng() * 3);
      for (let y = 0; y < depth; y++) {
        const f = 1 + (rng() - 0.5) * 0.16;
        setPx(c, x, y, shade([88, 176, 74], f));
      }
    }
  },
  dirt: ({ data, size, rng }) => {
    const c: PainterCtx = { data, size, rng };
    fillNoise(c, [122, 86, 54], 0.13);
    speckle(c, [98, 68, 42], 22);
    speckle(c, [146, 106, 66], 12);
  },
  stone: ({ data, size, rng }) => {
    const c: PainterCtx = { data, size, rng };
    fillNoise(c, [138, 143, 148], 0.07);
    // Blotches
    for (let i = 0; i < 7; i++) {
      const bx = Math.floor(rng() * size);
      const by = Math.floor(rng() * size);
      const f = 0.85 + rng() * 0.2;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          setPx(c, bx + dx, by + dy, shade([138, 143, 148], f));
        }
      }
    }
    speckle(c, [110, 115, 120], 14);
  },
  sand: ({ data, size, rng }) => {
    const c: PainterCtx = { data, size, rng };
    fillNoise(c, [231, 214, 160], 0.06);
    speckle(c, [212, 192, 136], 18);
    speckle(c, [244, 230, 184], 10);
  },
  water: ({ data, size, rng }) => {
    const c: PainterCtx = { data, size, rng };
    fillNoise(c, [63, 118, 228], 0.05);
    for (const y of [3, 9, 14]) {
      const off = Math.floor(rng() * size);
      for (let x = 0; x < size; x++) {
        if ((x + off) % 6 < 3) setPx(c, x, (y + Math.floor(x / 5)) % size, [92, 145, 240]);
      }
    }
  },
  log_side: ({ data, size, rng }) => {
    const c: PainterCtx = { data, size, rng };
    for (let x = 0; x < size; x++) {
      const stripe = x % 4 === 0 || x % 4 === 3 ? 0.82 : 1.02;
      for (let y = 0; y < size; y++) {
        const f = stripe * (1 + (rng() - 0.5) * 0.08);
        setPx(c, x, y, shade([110, 82, 47], f));
      }
    }
  },
  log_top: ({ data, size, rng }) => {
    const c: PainterCtx = { data, size, rng };
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        const ring = d % 3 < 1 ? 0.8 : 1.05;
        setPx(c, x, y, shade([158, 124, 76], ring * (1 + (rng() - 0.5) * 0.06)));
      }
    }
  },
  leaves: ({ data, size, rng }) => {
    const c: PainterCtx = { data, size, rng };
    fillNoise(c, [62, 125, 51], 0.18);
    speckle(c, [40, 92, 36], 30);
    speckle(c, [88, 156, 70], 24);
  },
  planks: ({ data, size, rng }) => {
    const c: PainterCtx = { data, size, rng };
    for (let y = 0; y < size; y++) {
      const boardEdge = y % 4 === 3;
      for (let x = 0; x < size; x++) {
        let f = 1 + (rng() - 0.5) * 0.08;
        if (boardEdge) f *= 0.72;
        // Occasional vertical seams per board row.
        if ((y >> 2) % 2 === 0 && x === 11 && !boardEdge) f *= 0.78;
        if ((y >> 2) % 2 === 1 && x === 4 && !boardEdge) f *= 0.78;
        setPx(c, x, y, shade([176, 138, 82], f));
      }
    }
  },
  brick: ({ data, size, rng }) => {
    const c: PainterCtx = { data, size, rng };
    for (let y = 0; y < size; y++) {
      const row = Math.floor(y / 4);
      const mortarRow = y % 4 === 3;
      for (let x = 0; x < size; x++) {
        const offset = (row % 2) * 4;
        const mortarCol = (x + offset) % 8 === 7;
        if (mortarRow || mortarCol) {
          setPx(c, x, y, shade([205, 196, 187], 1 + (rng() - 0.5) * 0.05));
        } else {
          setPx(c, x, y, shade([165, 80, 60], 1 + (rng() - 0.5) * 0.09));
        }
      }
    }
  },
  glass: ({ data, size, rng }) => {
    const c: PainterCtx = { data, size, rng };
    // Transparent center with an opaque frame and a couple of streak pixels.
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const border = x === 0 || y === 0 || x === size - 1 || y === size - 1;
        if (border) setPx(c, x, y, [208, 235, 242], 255);
        else setPx(c, x, y, [190, 225, 235], 0);
      }
    }
    setPx(c, 3, 3, [235, 248, 252], 255);
    setPx(c, 4, 2, [235, 248, 252], 255);
    setPx(c, 11, 10, [235, 248, 252], 255);
    void rng;
  },
  bedrock: ({ data, size, rng }) => {
    const c: PainterCtx = { data, size, rng };
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dark = rng();
        setPx(c, x, y, dark < 0.35 ? [42, 45, 50] : dark < 0.75 ? [58, 62, 68] : [78, 83, 90]);
      }
    }
  },
  sign: ({ data, size, rng }) => {
    const c: PainterCtx = { data, size, rng };
    // Standing sign silhouette: panel across the middle, post below.
    // Panel
    for (let y = 3; y <= 10; y++) {
      for (let x = 1; x <= size - 2; x++) {
        const border = y === 3 || y === 10 || x === 1 || x === size - 2;
        setPx(c, x, y, border ? [122, 92, 52] : shade([176, 138, 82], 1 + (rng() - 0.5) * 0.08));
      }
    }
    // Suggested writing lines.
    for (let x = 3; x <= 8; x++) setPx(c, x, 5, [122, 92, 52]);
    for (let x = 3; x <= 12; x++) setPx(c, x, 7, [122, 92, 52]);
    for (let x = 3; x <= 10; x++) setPx(c, x, 8, [122, 92, 52]);
    // Post
    for (let y = 11; y < size; y++) {
      for (const x of [7, 8]) {
        setPx(c, x, y, shade([110, 82, 47], 1 + (rng() - 0.5) * 0.08));
      }
    }
  },
};

export interface AtlasResult {
  texture: THREE.Texture;
  canvas: HTMLCanvasElement;
}

/** Paint the atlas and wrap it in a THREE texture (nearest-neighbor filtering). */
export function buildAtlas(): AtlasResult {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * TILE_PX;
  canvas.height = ATLAS_ROWS * TILE_PX;
  const g = canvas.getContext('2d')!;
  const img = g.createImageData(canvas.width, canvas.height);

  for (const [name, idx] of Object.entries(TILE_INDEX) as Array<[TileName, number]>) {
    const col = idx % ATLAS_COLS;
    const row = Math.floor(idx / ATLAS_COLS);
    const tileData = new Uint8ClampedArray(TILE_PX * TILE_PX * 4);
    const rng = mulberry32(hashString(`eb-tile/${name}`));
    PAINTERS[name]({ data: tileData, size: TILE_PX, rng });
    // Copy rows into the atlas image.
    for (let y = 0; y < TILE_PX; y++) {
      const srcStart = y * TILE_PX * 4;
      const dstStart = ((row * TILE_PX + y) * canvas.width + col * TILE_PX) * 4;
      img.data.set(tileData.subarray(srcStart, srcStart + TILE_PX * 4), dstStart);
    }
  }
  g.putImageData(img, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, canvas };
}

/**
 * UV rect for a tile with a small inset to prevent bleeding.
 * Returns [u0, v0, u1, v1]; v is flipped to match canvas orientation.
 */
export function tileUVRect(tile: TileName): [number, number, number, number] {
  const idx = TILE_INDEX[tile];
  const col = idx % ATLAS_COLS;
  const row = Math.floor(idx / ATLAS_COLS);
  const inset = 0.02 / 1;
  const w = 1 / ATLAS_COLS;
  const h = 1 / ATLAS_ROWS;
  const u0 = col * w + w * inset;
  const u1 = (col + 1) * w - w * inset;
  const v0 = 1 - (row + 1) * h + h * inset;
  const v1 = 1 - row * h - h * inset;
  return [u0, v0, u1, v1];
}

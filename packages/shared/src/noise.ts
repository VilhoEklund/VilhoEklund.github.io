/**
 * Deterministic integer-hash noise.
 *
 * Everything here is pure integer math (Math.imul, >>>) so results are
 * identical across browsers, Node and workerd. No Math.random anywhere.
 */

/** 32-bit integer avalanche hash. */
export function hashInt(n: number): number {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = (n ^ (n >>> 16)) >>> 0;
  return n;
}

/** Hash three integers into [0, 2^32). */
export function hash3(a: number, b: number, c: number): number {
  return hashInt((Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1)) >>> 0);
}

/** Hash an integer seed + two lattice coordinates into a float in [0,1). */
export function hash2f(seed: number, x: number, z: number): number {
  return hash3(seed, x | 0, z | 0) / 4294967296;
}

/** Deterministic 32-bit string hash (FNV-1a style) for seed strings / tile names. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Bilinear value noise in [0,1] at integer lattice scale 1. */
export function valueNoise2(seed: number, x: number, z: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = smootherstep(x - x0);
  const fz = smootherstep(z - z0);
  const v00 = hash2f(seed, x0, z0);
  const v10 = hash2f(seed, x0 + 1, z0);
  const v01 = hash2f(seed, x0, z0 + 1);
  const v11 = hash2f(seed, x0 + 1, z0 + 1);
  const a = v00 + (v10 - v00) * fx;
  const b = v01 + (v11 - v01) * fx;
  return a + (b - a) * fz;
}

export interface FbmOptions {
  octaves?: number;
  lacunarity?: number;
  gain?: number;
}

/** Fractal brownian motion of value noise; returns value in roughly [0,1]. */
export function fbm2(seed: number, x: number, z: number, opts: FbmOptions = {}): number {
  const octaves = Math.max(1, opts.octaves ?? 4);
  const lacunarity = opts.lacunarity ?? 2;
  const gain = opts.gain ?? 0.5;
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise2(seed + o * 0x9e3779b9, x * freq, z * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm === 0 ? 0 : sum / norm;
}

/** Deterministic small PRNG for texture painting etc. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-9), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Shortest-arc angle lerp (radians). */
export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

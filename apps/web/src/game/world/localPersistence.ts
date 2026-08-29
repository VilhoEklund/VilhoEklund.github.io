import {
  CHUNK_SIZE,
  TERRAIN_VERSION,
  WORLD_HEIGHT,
  chunkCoord,
  chunkKey,
  type SignInfo,
} from '@eternal-blocks/shared';
import type { WorldStore } from './worldStore.ts';

const STORAGE_SCHEMA = 1;
const STORAGE_ROOT = 'eternal-blocks.local-world';
const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;

interface StoredChunk {
  version: number;
  cx: number;
  cz: number;
  overrides: Array<[number, number]>;
  signs: SignInfo[];
}

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function validSign(value: unknown): value is SignInfo {
  if (!value || typeof value !== 'object') return false;
  const sign = value as Partial<SignInfo>;
  return (
    Number.isInteger(sign.x) &&
    Number.isInteger(sign.y) &&
    Number.isInteger(sign.z) &&
    typeof sign.text === 'string' &&
    typeof sign.authorId === 'string' &&
    typeof sign.authorName === 'string' &&
    typeof sign.updatedAt === 'number' &&
    (sign.rot === undefined || (Number.isInteger(sign.rot) && sign.rot >= 0 && sign.rot <= 3))
  );
}

function parseChunk(raw: string): StoredChunk | null {
  try {
    const value = JSON.parse(raw) as Partial<StoredChunk>;
    const cx = value.cx;
    const cz = value.cz;
    if (
      value.version !== STORAGE_SCHEMA ||
      typeof cx !== 'number' ||
      !Number.isInteger(cx) ||
      typeof cz !== 'number' ||
      !Number.isInteger(cz) ||
      !Array.isArray(value.overrides) ||
      !Array.isArray(value.signs)
    ) {
      return null;
    }
    const overrides = value.overrides.filter(
      (entry): entry is [number, number] =>
        Array.isArray(entry) &&
        entry.length === 2 &&
        Number.isInteger(entry[0]) &&
        entry[0] >= 0 &&
        entry[0] < CHUNK_VOLUME &&
        Number.isInteger(entry[1]) &&
        entry[1] >= 0 &&
        entry[1] <= 255,
    );
    const signs = value.signs.filter(validSign);
    return {
      version: STORAGE_SCHEMA,
      cx,
      cz,
      overrides,
      signs,
    };
  } catch {
    return null;
  }
}

/** Chunk-scoped persistence for the browser-only world. */
export class LocalWorldPersistence {
  private readonly prefix: string;

  constructor(
    seed: number,
    private readonly storage: Storage | null = browserStorage(),
  ) {
    // Seed and terrain version isolate saves when the generated world changes.
    this.prefix = `${STORAGE_ROOT}.v${STORAGE_SCHEMA}.t${TERRAIN_VERSION}.s${seed}.`;
  }

  /** Restore every edited chunk for this exact generated world. */
  loadInto(world: WorldStore): number {
    if (!this.storage) return 0;
    let loaded = 0;
    try {
      const keys: string[] = [];
      for (let i = 0; i < this.storage.length; i++) {
        const key = this.storage.key(i);
        if (key?.startsWith(this.prefix)) keys.push(key);
      }
      for (const key of keys) {
        const raw = this.storage.getItem(key);
        const saved = raw ? parseChunk(raw) : null;
        if (!saved) continue;
        world.applySnapshot(saved.cx, saved.cz, saved.overrides, saved.signs);
        loaded++;
      }
    } catch {
      return loaded;
    }
    return loaded;
  }

  /** Save the edited chunk containing a world coordinate. */
  saveChunkAt(world: WorldStore, wx: number, wz: number): boolean {
    if (!this.storage) return false;
    const cx = chunkCoord(wx);
    const cz = chunkCoord(wz);
    const key = chunkKey(cx, cz);
    const overrides = [...(world.overridesByChunk.get(key) ?? [])];
    const signs = [...world.signs.values()].filter(
      (sign) => chunkCoord(sign.x) === cx && chunkCoord(sign.z) === cz,
    );
    const storageKey = this.prefix + key;
    try {
      if (overrides.length === 0 && signs.length === 0) {
        this.storage.removeItem(storageKey);
      } else {
        const saved: StoredChunk = {
          version: STORAGE_SCHEMA,
          cx,
          cz,
          overrides,
          signs,
        };
        this.storage.setItem(storageKey, JSON.stringify(saved));
      }
      return true;
    } catch {
      return false;
    }
  }
}

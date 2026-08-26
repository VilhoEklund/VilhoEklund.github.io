import { STORAGE_KEYS } from './config.ts';
import { NICKNAME_MAX } from '@eternal-blocks/shared';

/** Anonymous, locally-persisted player identity. */
export interface Identity {
  playerId: string;
  name: string;
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  let out = '';
  for (let i = 0; i < 32; i++) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

export function loadIdentity(): Identity {
  let playerId = '';
  try {
    playerId = localStorage.getItem(STORAGE_KEYS.playerId) ?? '';
  } catch {
    /* storage unavailable */
  }
  if (!playerId || !/^[A-Za-z0-9_-]{8,64}$/.test(playerId)) {
    playerId = randomId();
    try {
      localStorage.setItem(STORAGE_KEYS.playerId, playerId);
    } catch {
      /* ignore */
    }
  }
  let name = '';
  try {
    name = localStorage.getItem(STORAGE_KEYS.name) ?? '';
  } catch {
    /* ignore */
  }
  return { playerId, name };
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.name, name);
  } catch {
    /* ignore */
  }
}

export interface Settings {
  sensitivity: number; // 0.2 .. 2.0
  renderDistance: number; // chunks
  fov: number; // degrees
  shadows: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1,
  renderDistance: 6,
  fov: 78,
  shadows: true,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export const NICK_MAX = NICKNAME_MAX;

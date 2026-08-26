/** Runtime configuration derived from build-time env vars. Never contains secrets. */

export interface AppConfig {
  /** WebSocket endpoint of the game server. Empty string means "not configured". */
  serverUrl: string;
  /** Enables window.__EB__ automation hooks (used by integration tests). */
  e2e: boolean;
}

function isLocalHost(): boolean {
  return (
    typeof location !== 'undefined' &&
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '[::1]')
  );
}

export function loadConfig(env: Record<string, string | undefined> = import.meta.env as never): AppConfig {
  let url = (env['VITE_GAME_SERVER_URL'] ?? '').trim();
  // Convenience for local development only; production builds must set the env var.
  if (!url && isLocalHost()) url = 'ws://localhost:8787/ws';
  const e2e =
    typeof location !== 'undefined' && new URLSearchParams(location.search).has('__e2e__');
  return { serverUrl: url, e2e };
}

export const STORAGE_KEYS = {
  playerId: 'eb.playerId.v1',
  name: 'eb.name.v1',
  settings: 'eb.settings.v1',
} as const;

import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';
import { DEFAULT_SETTINGS, loadSettings } from '../src/identity.ts';

describe('config', () => {
  it('uses the env-provided server URL when present', () => {
    const c = loadConfig({ VITE_GAME_SERVER_URL: 'wss://example.workers.dev/ws' });
    expect(c.serverUrl).toBe('wss://example.workers.dev/ws');
  });

  it('falls back to localhost worker during local development', () => {
    // In vitest (node) there is no window.location; isLocalHost() must not crash.
    const c = loadConfig({});
    expect(typeof c.serverUrl).toBe('string');
    expect(c.e2e).toBe(false);
  });
});

describe('settings', () => {
  it('defaults are sane and clamped to documented ranges', () => {
    expect(DEFAULT_SETTINGS.renderDistance).toBeGreaterThanOrEqual(2);
    expect(DEFAULT_SETTINGS.renderDistance).toBeLessThanOrEqual(10);
    expect(DEFAULT_SETTINGS.sensitivity).toBeGreaterThan(0);
    expect(loadSettings().sensitivity).toBeGreaterThan(0);
  });
});

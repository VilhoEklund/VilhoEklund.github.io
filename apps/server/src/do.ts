import { EXPORT_FORMAT } from '@eternal-blocks/shared';
import { durableObjectSql } from './adapters.ts';
import type { Env } from './env.ts';
import { tokensMatch } from './origin.ts';
import { ConnectionHandler, WorldCoordinator, WorldLockedError, type SocketLike } from './coordinator.ts';
import { WorldStore } from './store.ts';

/**
 * The single canonical world Durable Object.
 *
 * Uses the Hibernation WebSocket API: idle connections are evicted from
 * memory while their sockets stay open; incoming messages wake the object
 * and state is rebuilt lazily from SQLite. All permanent mutations are
 * committed to SQL storage before they are acknowledged or broadcast.
 */
export class EternalWorld {
  private coordinator: WorldCoordinator | null = null;
  private initPromise: Promise<WorldCoordinator> | null = null;
  private handlers = new Map<WebSocket, ConnectionHandler>();

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  private ensure(): Promise<WorldCoordinator> {
    if (this.coordinator) return Promise.resolve(this.coordinator);
    if (!this.initPromise) {
      this.initPromise = this.buildCoordinator();
    }
    return this.initPromise;
  }

  private async buildCoordinator(): Promise<WorldCoordinator> {
    const store = new WorldStore(durableObjectSql(this.state.storage));
    const coord = new WorldCoordinator(store);
    try {
      await coord.init(this.env.SEED_STRING);
    } catch (err) {
      if (err instanceof WorldLockedError) {
        coord.worldLocked = err;
      } else {
        throw err;
      }
    }
    await this.state.storage.setAlarm(Date.now() + 30_000);
    this.coordinator = coord;
    return coord;
  }

  async alarm(): Promise<void> {
    const coord = await this.ensure();
    const live = new Set<string>();
    for (const ws of this.liveSockets()) {
      const att = readAttachment(ws);
      if (att?.pid) live.add(att.pid);
    }
    coord.sweep(live);
    await this.state.storage.setAlarm(Date.now() + 30_000);
  }

  private liveSockets(): WebSocket[] {
    const s = this.state as DurableObjectState & {
      getWebSockets?: () => WebSocket[];
      getWebsockets?: () => WebSocket[];
    };
    if (typeof s.getWebSockets === 'function') return s.getWebSockets();
    if (typeof s.getWebsockets === 'function') return s.getWebsockets();
    return [...this.handlers.keys()];
  }

  // ---------------------------------------------------------------------------
  // HTTP routes served by the DO itself
  // ---------------------------------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    switch (url.pathname) {
      case '/ws':
        return this.upgrade();
      case '/stats': {
        const coord = await this.ensure();
        return jsonResponse({
          ok: true,
          online: coord.onlineCount(),
          seed: coord.worldLocked ? null : coord.seed,
          terrainVersion: coord.worldLocked ? null : coord.store.meta.terrainVersion,
          locked: Boolean(coord.worldLocked),
        });
      }
      case '/export': {
        await this.ensure();
        return this.handleExport(request);
      }
      case '/import': {
        await this.ensure();
        return this.handleImport(request);
      }
      case '/admin/ban':
      case '/admin/unban': {
        await this.ensure();
        return this.handleBan(request, url.pathname === '/admin/ban');
      }
      default:
        return jsonResponse({ ok: false, error: 'not found' }, 404);
    }
  }

  private upgrade(): Response {
    const pair = new WebSocketPair();
    const server = pair[1];
    const state = this.state as DurableObjectState & { acceptWebSocket(ws: WebSocket): void };
    state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  private requireAdmin(request: Request): boolean {
    const header = request.headers.get('Authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    return tokensMatch(token, this.env.ADMIN_TOKEN);
  }

  private handleExport(request: Request): Response {
    if (!this.requireAdmin(request)) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
    if (this.coordinator?.worldLocked) {
      return jsonResponse({ ok: false, error: 'world locked; export refused' }, 409);
    }
    const data = this.ensureSyncStore().exportAll();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="eternal-blocks-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  }

  private async handleImport(request: Request): Promise<Response> {
    if (!this.requireAdmin(request)) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ ok: false, error: 'invalid json body' }, 400);
    }
    const b = body as { confirm?: string; data?: Record<string, unknown> };
    if (b?.confirm !== 'merge') {
      return jsonResponse({ ok: false, error: "body must include \"confirm\":\"merge\" (merge-only import)" }, 400);
    }
    const store = this.ensureSyncStore();
    try {
      const res = await store.importMerge((b.data ?? {}) as Parameters<WorldStore['importMerge']>[0]);
      return jsonResponse({ ok: true, ...res });
    } catch (err) {
      return jsonResponse({ ok: false, error: String(err instanceof Error ? err.message : err) }, 409);
    }
  }

  private async handleBan(request: Request, ban: boolean): Promise<Response> {
    if (!this.requireAdmin(request)) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
    let body: { playerId?: string; reason?: string };
    try {
      body = (await request.json()) as { playerId?: string; reason?: string };
    } catch {
      return jsonResponse({ ok: false, error: 'invalid json body' }, 400);
    }
    if (typeof body.playerId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(body.playerId)) {
      return jsonResponse({ ok: false, error: 'playerId malformed' }, 400);
    }
    const store = this.ensureSyncStore();
    const changed =
      ban ? store.setBan(body.playerId, String(body.reason ?? 'no reason given'), 'admin') : store.clearBan(body.playerId, 'admin');
    if (!changed) return jsonResponse({ ok: false, error: 'unknown playerId' }, 404);
    // If the player is connected right now, kick them.
    if (ban) {
      for (const [pid, handler] of [...this.handlerByPid()]) {
        if (pid === body.playerId) handler.kick(4003, 'banned');
      }
    }
    return jsonResponse({ ok: true });
  }

  private handlerByPid(): Map<string, ConnectionHandler> {
    const out = new Map<string, ConnectionHandler>();
    for (const h of this.handlers.values()) {
      if (h.playerId && !h.closed) out.set(h.playerId, h);
    }
    return out;
  }

  /** Synchronous accessor when the coordinator is guaranteed to exist already. */
  private ensureSyncStore(): WorldStore {
    if (!this.coordinator) throw new Error('coordinator not initialized');
    return this.coordinator.store;
  }

  // ---------------------------------------------------------------------------
  // WebSocket events (Hibernation API)
  // ---------------------------------------------------------------------------

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const coord = await this.ensure();
    let handler = this.handlers.get(ws);
    if (!handler) {
      handler = coord.createHandler(socketLike(ws));
      this.handlers.set(ws, handler);
    }
    try {
      await handler.handleRawFrame(raw);
      // Persist the player id on the socket so hibernation wakeups (and the
      // alarm sweep) can attribute sockets to players without memory state.
      if (handler.playerId && readAttachment(ws)?.pid !== handler.playerId) {
        try {
          ws.serializeAttachment({ pid: handler.playerId } satisfies SocketAttachment);
        } catch {
          /* attachment unsupported in some runtimes; presence sweep degrades gracefully */
        }
      }
    } catch (err) {
      console.error('message handling failed', err);
      try {
        handler.send({ t: 'error', code: 'server_error', msg: 'internal error' });
      } catch {
        /* ignore */
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const handler = this.handlers.get(ws);
    if (handler) {
      handler.close();
      this.handlers.delete(ws);
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SocketAttachment {
  pid: string | null;
}

function readAttachment(ws: WebSocket): SocketAttachment | null {
  try {
    return ws.deserializeAttachment() as SocketAttachment | null;
  } catch {
    return null;
  }
}

function socketLike(ws: WebSocket): SocketLike {
  return {
    send(data: string): void {
      ws.send(data);
    },
    close(code?: number, reason?: string): void {
      try {
        ws.close(code, reason);
      } catch {
        /* already closed */
      }
    },
  };
}

export function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Export-Format': EXPORT_FORMAT },
  });
}

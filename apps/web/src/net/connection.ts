import {
  PING_INTERVAL_MS,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
} from '@eternal-blocks/shared';
import { Emitter } from '../util/emitter.ts';

export type NetState = 'idle' | 'connecting' | 'connected' | 'waiting-retry';

interface NetEvents extends Record<string, unknown> {
  message: ServerMessage;
  state: { state: NetState; attempt: number; nextRetryInMs: number | null };
}

const BASE_DELAY_MS = 600;
const MAX_DELAY_MS = 15_000;

/**
 * WebSocket connection with exponential backoff reconnect, ping watchdog and
 * typed message dispatch. The server treats every new connection as a fresh
 * session; full resynchronization happens after each (re)connect.
 */
export class NetClient {
  readonly events = new Emitter<NetEvents>();
  state: NetState = 'idle';
  attempt = 0;

  private ws: WebSocket | null = null;
  private retryTimer: number | null = null;
  private pingTimer: number | null = null;
  private lastRecvAt = 0;
  private closedByUs = false;

  constructor(private readonly url: string) {}

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  connect(hello: { name: string; playerId: string }, helloPayload?: ClientMessage): void {
    if (!this.url) return;
    this.closedByUs = false;
    this.clearRetry();
    this.setState('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch (err) {
      console.error('websocket construction failed', err);
      this.scheduleReconnect(hello, helloPayload);
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      const payload: ClientMessage =
        helloPayload ?? { t: 'hello', proto: PROTOCOL_VERSION, ...hello };
      ws.send(JSON.stringify(payload));
      this.lastRecvAt = Date.now();
      this.startPing();
      // "connected" is confirmed by the welcome message; treat open as provisional.
      this.setState('connecting');
    };

    ws.onmessage = (ev) => {
      this.lastRecvAt = Date.now();
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        return; // never trust malformed frames
      }
      if (msg.t === 'welcome') {
        this.attempt = 0;
        this.setState('connected');
      }
      this.events.emit('message', msg);
    };

    ws.onclose = (ev) => {
      this.stopPing();
      this.ws = null;
      if (this.closedByUs) {
        this.setState('idle');
        return;
      }
      console.info(`connection closed (${ev.code})`);
      this.events.emit('message', { t: 'error', code: 'server_error', msg: `connection lost (${ev.code})` });
      this.scheduleReconnect(hello, helloPayload);
    };

    ws.onerror = () => {
      /* onclose follows */
    };
  }

  /** Force-close and reconnect immediately (watchdog timeout). */
  forceReconnect(): void {
    if (this.ws) {
      try {
        this.ws.close(4000, 'watchdog');
      } catch {
        /* ignore */
      }
    }
  }

  send(msg: ClientMessage): boolean {
    if (!this.connected || !this.ws) return false;
    try {
      this.ws.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    this.closedByUs = true;
    this.clearRetry();
    this.stopPing();
    if (this.ws) {
      try {
        this.ws.close(1000, 'bye');
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    this.setState('idle');
  }

  /** Called from the game loop: detect dead connections. */
  watchdogTick(): void {
    if (this.state === 'connected' && Date.now() - this.lastRecvAt > PING_INTERVAL_MS * 2.2) {
      this.forceReconnect();
    }
  }

  private scheduleReconnect(hello: { name: string; playerId: string }, payload?: ClientMessage): void {
    if (this.retryTimer !== null) return;
    this.attempt++;
    const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * Math.pow(2, Math.min(this.attempt, 6))) *
      (0.7 + Math.random() * 0.6);
    this.setState('waiting-retry', delay);
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      this.connect(hello, payload);
    }, delay);
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = window.setInterval(() => {
      this.send({ t: 'ping', ts: Date.now() });
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private setState(state: NetState, nextRetryInMs: number | null = null): void {
    if (this.state === state && nextRetryInMs === null) return;
    this.state = state;
    this.events.emit('state', { state, attempt: this.attempt, nextRetryInMs });
  }
}

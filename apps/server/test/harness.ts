import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { WorldCoordinator, type ConnectionHandler, type SocketLike } from '../src/coordinator.ts';
import { WorldStore } from '../src/store.ts';
import type { ClientMessage, ServerMessage } from '@eternal-blocks/shared';

/** SQLite-backed SqlAdapter for tests (mirrors Durable Object semantics). */
export class FakeSql {
  constructor(private readonly db: DatabaseSync) {}

  run(query: string, ...params: unknown[]): { changes: number } {
    const stmt = this.db.prepare(query) as StatementSync;
    return { changes: Number(stmt.run(...(params as Parameters<StatementSync['run']>)).changes) };
  }

  all<T = Record<string, unknown>>(query: string, ...params: unknown[]): T[] {
    const stmt = this.db.prepare(query) as StatementSync;
    return stmt.all(...(params as Parameters<StatementSync['all']>)) as T[];
  }

  async transaction<T>(fn: () => T | Promise<T>): Promise<T> {
    this.db.exec('BEGIN');
    try {
      const result = await fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
}

/** In-memory socket capturing everything the coordinator sends. */
export class FakeSocket implements SocketLike {
  readonly frames: string[] = [];
  readonly messages: ServerMessage[] = [];
  closed = false;
  closeCode: number | undefined;
  closeReason: string | undefined;
  attachment: unknown = null;
  onClose: (() => void) | null = null;

  send(data: string): void {
    if (this.closed) throw new Error('socket closed');
    this.frames.push(data);
    this.messages.push(JSON.parse(data) as ServerMessage);
  }

  close(code?: number, reason?: string): void {
    if (this.closed) return;
    this.closed = true;
    this.closeCode = code;
    this.closeReason = reason;
    this.onClose?.();
  }

  serializeAttachment(value: unknown): void {
    this.attachment = value;
  }

  deserializeAttachment(): unknown {
    return this.attachment;
  }

  ofType<K extends ServerMessage['t']>(type: K): Array<Extract<ServerMessage, { t: K }>> {
    return this.messages.filter((m) => m.t === type) as Array<Extract<ServerMessage, { t: K }>>;
  }

  last(): ServerMessage | undefined {
    return this.messages[this.messages.length - 1];
  }
}

export interface TestWorld {
  coord: WorldCoordinator;
  store: WorldStore;
  db: DatabaseSync;
}

/** Create a coordinator backed by a fresh in-memory database. */
export async function makeWorld(now: () => number = () => Date.now(), seedString?: string): Promise<TestWorld> {
  const db = new DatabaseSync(':memory:');
  const store = new WorldStore(new FakeSql(db), now);
  const coord = new WorldCoordinator(store, now);
  await coord.init(seedString);
  return { coord, store, db };
}

/** A scripted player driving a ConnectionHandler directly. */
export class TestPlayer {
  readonly socket = new FakeSocket();
  readonly handler: ConnectionHandler;

  constructor(
    private readonly coord: WorldCoordinator,
    readonly playerId: string,
    readonly name: string,
  ) {
    this.handler = coord.createHandler(this.socket);
  }

  async connect(autoMove = true): Promise<void> {
    await this.raw({ t: 'hello', proto: 1, name: this.name, playerId: this.playerId });
    if (autoMove) {
      const sp = this.coord.spawnPoint();
      await this.raw({ t: 'pos', x: sp.x, y: sp.y, z: sp.z, yaw: 0, pitch: 0 });
    }
  }

  async raw(frame: unknown): Promise<void> {
    await this.handler.handleRawFrame(typeof frame === 'string' ? frame : JSON.stringify(frame));
  }

  async send(msg: ClientMessage): Promise<void> {
    await this.raw(msg);
  }

  get welcome() {
    return this.socket.ofType('welcome')[0];
  }

  disconnect(): void {
    this.handler.close();
  }
}

let uidCounter = 0;
export function testId(prefix = 'pid'): string {
  uidCounter += 1;
  return `${prefix}${String(uidCounter).padStart(8, '0')}xxxx`;
}

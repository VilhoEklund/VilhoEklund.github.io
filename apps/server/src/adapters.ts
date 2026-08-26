/**
 * Minimal storage adapter interfaces.
 *
 * The Durable Object binds these to `state.storage.sql` (+ `state.storage`
 * transactions). Tests bind them to a local SQLite database. Keeping game
 * logic behind this seam also leaves room to shard chunk storage across
 * multiple DOs later without touching protocol code.
 */

export interface RunResult {
  /** Rows written by the statement (0 for ignored conflicts). */
  changes: number;
}

export interface SqlAdapter {
  run(query: string, ...params: unknown[]): RunResult;
  all<T = Record<string, unknown>>(query: string, ...params: unknown[]): T[];
  /**
   * Run fn atomically: either every statement inside commits, or none do.
   */
  transaction<T>(fn: () => T | Promise<T>): Promise<T>;
}

/** Wrap a Cloudflare Durable Object storage in the adapter interfaces. */
export function durableObjectSql(storage: DurableObjectStorage): SqlAdapter {
  return {
    run(query: string, ...params: unknown[]): RunResult {
      const cursor = storage.sql.exec(query, ...(params as never[]));
      return { changes: Number(cursor.rowsWritten) };
    },
    all<T>(query: string, ...params: unknown[]): T[] {
      return storage.sql.exec(query, ...(params as never[])).toArray() as T[];
    },
    transaction<T>(fn: () => T | Promise<T>): Promise<T> {
      return storage.transaction(fn as (txn: DurableObjectTransaction) => Promise<T>) as Promise<T>;
    },
  };
}

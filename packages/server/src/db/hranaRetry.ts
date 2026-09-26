// ─── Hrana stream recovery (Turso) ──────────────────────────────────────────
// Turso expires idle Hrana streams; the next statement executed on a dead
// stream fails with a 404 HranaError: `stream not found: <id>` — the error the
// client surfaces is `Hrana(Api("status=404 Not Found, body={\"error\":\"stream
// not found: …\"}"))`. The driver does not reconnect on its own, but any
// statement retried on a fresh stream succeeds. This helper retries
// synchronously (libsql's drop-in sync API executes eagerly) and is wired into
// db/index.ts via a Proxy around the database handle, so every prepare /
// transaction / pragma / exec call site is covered without touching endpoints.

export const HRANA_MAX_RETRIES = 2;

export function isHranaStreamError(err: unknown): boolean {
  if (!err) return false;
  const message = err instanceof Error
    ? err.message
    : typeof err === 'string'
      ? err
      : String(err ?? '');
  return /stream not found/i.test(message);
}

export interface HranaRetryOptions {
  /** Master switch — false makes this a passthrough (local SQLite). */
  enabled?: boolean;
  /** How many times to retry after the first failure (default 2). */
  retries?: number;
  /** Observability hook (tests / structured logging). */
  onRetry?: (attempt: number, err: unknown) => void;
}

type SyncFn<R> = () => R;

export function withHranaRetry<R>(fn: SyncFn<R>, opts?: HranaRetryOptions): R {
  const enabled = opts?.enabled ?? true;
  const maxRetries = opts?.retries ?? HRANA_MAX_RETRIES;
  if (!enabled) return fn();
  let attempt = 0;
  for (;;) {
    try {
      return fn();
    } catch (err) {
      if (attempt >= maxRetries || !isHranaStreamError(err)) throw err;
      attempt += 1;
      opts?.onRetry?.(attempt, err);
      console.warn(`[db] Hrana stream lost — retrying statement (${attempt}/${maxRetries})`);
    }
  }
}

// Statement-level methods that actually execute against the stream. Mutators
// like pluck()/expand()/safeIntegers()/raw() (chaining/configuration) are left
// untouched, and iterate() is excluded because a partially-consumed iterator
// cannot be safely replayed.
const STATEMENT_EXEC_METHODS = new Set(['get', 'all', 'run']);

// Database-level entry points that start work on a stream.
const DB_EXEC_METHODS = new Set(['prepare', 'transaction', 'pragma', 'exec', 'run', 'batch']);

function wrapStatement(stmt: object): object {
  return new Proxy(stmt, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function' || !STATEMENT_EXEC_METHODS.has(String(prop))) return value;
      return (...args: unknown[]) => withHranaRetry(() => value.apply(target, args));
    },
  });
}

/**
 * Wrap a database handle (better-sqlite3-compatible, e.g. libsql) so that any
 * statement hitting an expired Hrana stream is transparently retried on a
 * fresh one. `transaction` gets special treatment: the driver's
 * db.transaction(fn) returns a runner function, so the WHOLE transaction is
 * retried if the stream dies mid-run.
 */
export function wrapWithHranaRetry<T extends object>(db: T, enabled = true): T {
  if (!enabled) return db;
  return new Proxy(db, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      const name = String(prop);
      if (!DB_EXEC_METHODS.has(name)) return value;
      if (name === 'transaction') {
        return (...args: unknown[]) => {
          const runner = value.apply(target, args);
          if (typeof runner !== 'function') return runner;
          return (...runnerArgs: unknown[]) =>
            withHranaRetry(() => runner.apply(target, runnerArgs));
        };
      }
      if (name === 'prepare') {
        return (...args: unknown[]) => {
          const stmt = value.apply(target, args);
          return stmt && typeof stmt === 'object' ? wrapStatement(stmt as object) : stmt;
        };
      }
      return (...args: unknown[]) => withHranaRetry(() => value.apply(target, args));
    },
  });
}

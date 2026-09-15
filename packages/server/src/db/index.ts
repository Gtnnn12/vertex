import DatabaseType from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { config } from '../config.js';
import * as schema from './schema.js';
import { ensureDefaults, backfillOneOnOneDmMembership } from './migrate.js';
import { setWorkerId } from '../utils/snowflake.js';
import { createSnapshot } from '../utils/backup.js';
import { hasPendingMigrations } from './pendingMigrations.js';
import { mkdirSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Backend selection: Turso (managed libSQL) vs local SQLite ─────────────
// The `libsql` npm package is a drop-in better-sqlite3 replacement: identical
// synchronous API (prepare/get/all/run/transaction/pragma), but it speaks the
// Hrana protocol over HTTP, so a Turso URL persists data across platform
// redeploys. Both backends run the same schema, the same idempotent drizzle
// migrations and the same ensureDefaults boot invariants — zero call-site
// changes anywhere in the codebase.
export const usingTurso = Boolean(process.env.TURSO_DATABASE_URL);

// The Database type comes from better-sqlite3 for typings; at runtime the
// constructor is swapped for libsql's in Turso mode (API-compatible).
type DatabaseConstructor = new (
  pathOrUrl: string,
  options?: { authToken?: string },
) => DatabaseType.Database;

async function loadDatabaseConstructor(): Promise<DatabaseConstructor> {
  if (usingTurso) {
    const mod = await import('libsql');
    return (mod.default ?? mod) as unknown as DatabaseConstructor;
  }
  const mod = await import('better-sqlite3');
  return (mod.default ?? mod) as unknown as DatabaseConstructor;
}

let sqlite: DatabaseType.Database;

function ensureDirectory(filePath: string): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
}

export async function initDatabase() {
  const DatabaseCtor = await loadDatabaseConstructor();

  let dbExistedFlag = false;
  if (usingTurso) {
    const url = process.env.TURSO_DATABASE_URL!;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    console.log(`[db] Using Turso backend: ${url.replace(/^[a-z]+:\/\/([^/]+)\/.*/, '$1/…')}`);
    // libsql drop-in: same sync API, but the URL is remote — no local file, so
    // no ensureDirectory/dbExisted/snapshot logic applies (Turso has its own
    // backups; local snapshots of a remote DB are meaningless).
    sqlite = new DatabaseCtor(url, authToken ? { authToken } : undefined);
    sqlite.pragma('foreign_keys = ON');
  } else {
    ensureDirectory(config.dbPath);
    // Capture existence BEFORE opening — new Database() creates the file, so a
    // post-open check would always report "exists" and snapshot a 0-row DB on first boot.
    dbExistedFlag = existsSync(config.dbPath);
    sqlite = new DatabaseCtor(config.dbPath);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
  }

  const migrationsFolder = resolve(__dirname, '../../drizzle');

  if (!usingTurso && !config.backup.disabled && dbExistedFlag && hasPendingMigrations(sqlite, migrationsFolder)) {
    try {
      const snap = createSnapshot(sqlite, 'pre-migration');
      console.log(`[backup] pre-migration snapshot written: ${snap}`);
    } catch (err) {
      console.error(`[backup] pre-migration snapshot FAILED — aborting migration to protect data: ${(err as Error).message}`);
      throw err;
    }
  }

  const drizzleDb = drizzle(sqlite, { schema });
  migrate(drizzleDb, { migrationsFolder });

  // Ensure data invariants (settings row, worker ID, first admin)
  ensureDefaults(sqlite);
  // Recover pre-fix broken 1-on-1 DM threads (deleted partner's membership row
  // lost before the tombstone fix). Idempotent — safe no-op on every later boot.
  backfillOneOnOneDmMembership(sqlite);

  // Initialize Snowflake worker ID from persisted value
  const settings = sqlite.prepare('SELECT worker_id FROM instance_settings WHERE id = 1').get() as { worker_id: number } | undefined;
  if (settings?.worker_id !== undefined && settings.worker_id !== null) {
    setWorkerId(settings.worker_id);
    console.log(`Snowflake worker ID: ${settings.worker_id}`);
  } else {
    throw new Error('Snowflake worker_id not found in instance_settings — migration failed');
  }

  console.log(usingTurso
    ? '[db] Database initialized on Turso (persistent across redeploys)'
    : `Database initialized at ${config.dbPath}`);
  return drizzleDb;
}

type DrizzleDb = ReturnType<typeof drizzle>;
export type DB = DrizzleDb;

let db: DB;

export function getDb(): DB {
  if (!db) {
    throw new Error(
      'Database not initialized — initDatabase() is async and must be awaited ' +
      'at boot before any route/store touches the DB. Use initDatabaseOnce().',
    );
  }
  return db;
}

// Single-flight boot initializer — called (and awaited) once from index.ts.
let initPromise: Promise<DB> | null = null;
export function initDatabaseOnce(): Promise<DB> {
  if (!db && !initPromise) {
    initPromise = initDatabase().then((d) => {
      db = d;
      return d;
    });
  }
  return initPromise!;
}

export function getRawDb(): import('better-sqlite3').Database {
  return sqlite!;
}

export function closeDatabase(): void {
  if (sqlite) {
    sqlite.close();
  }
}

export { schema };

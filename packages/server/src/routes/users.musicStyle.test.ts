import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from '../db/schema.js';
import { setWorkerId } from '../utils/snowflake.js';
import { signJwt } from '../utils/auth.js';

setWorkerId(23);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

type TestDb = ReturnType<typeof drizzle<typeof schema>>;
let sqlite: Database.Database;
let testDb: TestDb;
let app: FastifyInstance;

vi.mock('../db/index.js', () => ({
  getDb: () => testDb,
  getRawDb: () => sqlite,
  schema,
}));

// The PATCH handler only needs the broadcast helpers in this test — nothing
// asserts on them. The S2S block is gated on `!homeInstance` (native user).
vi.mock('../ws/handler.js', () => ({
  connectionManager: {
    sendToUser: vi.fn(),
    sendToSpace: vi.fn(),
    sendToDmMembers: vi.fn(),
    setUserShowActivity: vi.fn(),
    clearUserActivities: vi.fn(),
    getUserStatus: vi.fn(() => 'online'),
    forceDisconnectUser: vi.fn(),
  },
}));

function applyMigrations(db: Database.Database): void {
  const dir = path.resolve(__dirname, '../../drizzle');
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    const sqlText = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const stmt of sqlText.split(/-->\s*statement-breakpoint/)) {
      const clean = stmt.trim();
      if (clean) db.exec(clean);
    }
  }
  // Columns added by ensureDefaults (db/migrate.ts) at runtime, not by the
  // drizzle SQL files — mirror them ALL here or TS-schema inserts crash with
  // "no column named ...".
  const runtimeColumns: Array<[string, string]> = [
    ['netrex_enabled', 'netrex_enabled INTEGER DEFAULT 0'],
    ['netrex_expires_at', 'netrex_expires_at INTEGER'],
    ['netrex_until', 'netrex_until INTEGER'],
    ['profile_board', 'profile_board TEXT'],
    ['profile_accent', 'profile_accent TEXT'],
    ['staff_role', 'staff_role TEXT'],
    ['last_seen_at', 'last_seen_at INTEGER'],
    ['banned_until', 'banned_until INTEGER'],
    ['ban_reason', 'ban_reason TEXT'],
    ['banned_at', 'banned_at INTEGER'],
    ['banned_by', 'banned_by TEXT'],
  ];
  for (const [column, ddl] of runtimeColumns) {
    try {
      db.prepare(`SELECT ${column} FROM users LIMIT 1`).get();
    } catch {
      db.exec(`ALTER TABLE users ADD COLUMN ${ddl}`);
    }
  }
}

async function buildApp(): Promise<FastifyInstance> {
  const { userRoutes } = await import('./users.js');
  const f = Fastify({ logger: false });
  await f.register(userRoutes);
  await f.ready();
  return f;
}

// Native user WITHOUT any Netrex grant — premium styles must fall back to vinyl.
const USER_ID = 'user-1';
const USER_USERNAME = 'musicfan';
// Native user WITH a permanent Netrex grant — premium styles are accepted.
const NETREX_ID = 'netrex-1';
const NETREX_USERNAME = 'netrexfan';

async function seedUsers(): Promise<void> {
  testDb.insert(schema.users).values([
    {
      id: USER_ID,
      username: USER_USERNAME,
      passwordHash: 'x',
      status: 'offline',
      isAdmin: 0,
      isDeleted: 0,
      homeInstance: null,
      createdAt: Date.now(),
    },
    {
      id: NETREX_ID,
      username: NETREX_USERNAME,
      passwordHash: 'x',
      status: 'offline',
      isAdmin: 0,
      isDeleted: 0,
      netrexEnabled: 1,
      netrexExpiresAt: null, // permanent grant
      homeInstance: null,
      createdAt: Date.now(),
    },
  ]).run();
}

function tokenFor(userId: string, username: string): string {
  return signJwt({ userId, username });
}

beforeEach(async () => {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  applyMigrations(sqlite);
  testDb = drizzle(sqlite, { schema });
  await seedUsers();
  app = await buildApp();
});

describe('PATCH /api/users/@me — musicWidgetStyle Netrex gate', () => {
  it('accepts the free vinyl style for a user without Netrex', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/@me',
      headers: { Authorization: `Bearer ${tokenFor(USER_ID, USER_USERNAME)}` },
      payload: { musicWidgetStyle: 'vinyl' },
    });

    expect(res.statusCode).toBe(200);
    const row = testDb.select().from(schema.users).where(eq(schema.users.id, USER_ID)).get();
    expect(row?.musicWidgetStyle).toBe('vinyl');
  });

  it('accepts the free aurora base style for a user without Netrex', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/@me',
      headers: { Authorization: `Bearer ${tokenFor(USER_ID, USER_USERNAME)}` },
      payload: { musicWidgetStyle: 'aurora' },
    });

    expect(res.statusCode).toBe(200);
    const row = testDb.select().from(schema.users).where(eq(schema.users.id, USER_ID)).get();
    expect(row?.musicWidgetStyle).toBe('aurora');
  });

  it('silently falls back to vinyl when a non-Netrex user picks a premium style', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/@me',
      headers: { Authorization: `Bearer ${tokenFor(USER_ID, USER_USERNAME)}` },
      payload: { musicWidgetStyle: 'cassette' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.musicWidgetStyle).toBe('vinyl');
    const row = testDb.select().from(schema.users).where(eq(schema.users.id, USER_ID)).get();
    expect(row?.musicWidgetStyle).toBe('vinyl');
  });

  it('accepts a premium style for a Netrex-granted user', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/@me',
      headers: { Authorization: `Bearer ${tokenFor(NETREX_ID, NETREX_USERNAME)}` },
      payload: { musicWidgetStyle: 'neon-city' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().musicWidgetStyle).toBe('neon-city');
    const row = testDb.select().from(schema.users).where(eq(schema.users.id, NETREX_ID)).get();
    expect(row?.musicWidgetStyle).toBe('neon-city');
  });

  it('accepts a premium style based on a purchased plan (netrexUntil)', async () => {
    testDb.update(schema.users)
      .set({ netrexEnabled: 0, netrexUntil: Date.now() + 86_400_000 })
      .where(eq(schema.users.id, USER_ID))
      .run();

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/@me',
      headers: { Authorization: `Bearer ${tokenFor(USER_ID, USER_USERNAME)}` },
      payload: { musicWidgetStyle: 'holo-room' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().musicWidgetStyle).toBe('holo-room');
  });

  it('falls back to vinyl when the grant has expired', async () => {
    testDb.update(schema.users)
      .set({ netrexEnabled: 1, netrexExpiresAt: Date.now() - 1000 })
      .where(eq(schema.users.id, USER_ID))
      .run();

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/@me',
      headers: { Authorization: `Bearer ${tokenFor(USER_ID, USER_USERNAME)}` },
      payload: { musicWidgetStyle: 'spectrum' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().musicWidgetStyle).toBe('vinyl');
  });

  it('maps unknown style strings to vinyl', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/@me',
      headers: { Authorization: `Bearer ${tokenFor(NETREX_ID, NETREX_USERNAME)}` },
      payload: { musicWidgetStyle: '<script>alert(1)</script>' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().musicWidgetStyle).toBe('vinyl');
  });
});

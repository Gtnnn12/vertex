import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from '../db/schema.js';
import { setWorkerId } from '../utils/snowflake.js';
import { signJwt } from '../utils/auth.js';

setWorkerId(23);

type TestDb = ReturnType<typeof drizzle<typeof schema>>;
let sqlite: Database.Database;
let testDb: TestDb;
let app: FastifyInstance;

vi.mock('../db/index.js', () => ({
  getDb: () => testDb,
  getRawDb: () => sqlite,
  schema,
}));

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

const USER_ID = 'user-1';
const USER_USERNAME = 'boardfan';
const NETREX_ID = 'netrex-1';
const NETREX_USERNAME = 'netrexboard';

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
      netrexExpiresAt: null,
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

describe('PUT /api/users/@me/board — Netrex gate', () => {
  it('rejects a save from a user without Netrex (403)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/users/@me/board',
      headers: { Authorization: `Bearer ${tokenFor(USER_ID, USER_USERNAME)}` },
      payload: { widgets: [] },
    });
    expect(res.statusCode).toBe(403);
    const row = testDb.select().from(schema.users).where(eq(schema.users.id, USER_ID)).get();
    expect(row?.profileBoard ?? null).toBeNull();
  });

  it('accepts a save from a Netrex user (200)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/users/@me/board',
      headers: { Authorization: `Bearer ${tokenFor(NETREX_ID, NETREX_USERNAME)}` },
      payload: {
        widgets: [{ id: 'w1', type: 'quote', visible: true, config: { text: 'Hola mundo' } }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.widgets).toHaveLength(1);
    const row = testDb.select().from(schema.users).where(eq(schema.users.id, NETREX_ID)).get();
    expect(JSON.parse(row!.profileBoard!)).toHaveLength(1);
  });
});

describe('PUT /api/users/@me/board — validation', () => {
  it('rejects a non-array payload (400)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/users/@me/board',
      headers: { Authorization: `Bearer ${tokenFor(NETREX_ID, NETREX_USERNAME)}` },
      payload: { widgets: 'nope' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('truncates to MAX_BOARD_WIDGETS (6)', async () => {
    const widgets = Array.from({ length: 9 }, (_, i) => ({
      id: `w${i}`,
      type: 'quote',
      visible: true,
      config: { text: `q${i}` },
    }));
    const res = await app.inject({
      method: 'PUT',
      url: '/api/users/@me/board',
      headers: { Authorization: `Bearer ${tokenFor(NETREX_ID, NETREX_USERNAME)}` },
      payload: { widgets },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().widgets).toHaveLength(6);
  });

  it('drops unknown widget types and duplicate ids', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/users/@me/board',
      headers: { Authorization: `Bearer ${tokenFor(NETREX_ID, NETREX_USERNAME)}` },
      payload: {
        widgets: [
          { id: 'a', type: 'quote', visible: true, config: { text: 'ok' } },
          { id: 'b', type: 'hacker-widget', visible: true, config: {} },
          { id: 'a', type: 'mood', visible: true, config: { text: 'dup' } },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const widgets = res.json().widgets;
    expect(widgets).toHaveLength(1);
    expect(widgets[0].id).toBe('a');
  });

  it('enforces per-field length limits', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/users/@me/board',
      headers: { Authorization: `Bearer ${tokenFor(NETREX_ID, NETREX_USERNAME)}` },
      payload: {
        widgets: [
          { id: 'q', type: 'quote', visible: true, config: { text: 'x'.repeat(500) } },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const cfg = res.json().widgets[0].config;
    expect(cfg.text.length).toBeLessThanOrEqual(160);
  });

  it('rejects non-http(s) social link URLs (javascript:, data:)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/users/@me/board',
      headers: { Authorization: `Bearer ${tokenFor(NETREX_ID, NETREX_USERNAME)}` },
      payload: {
        widgets: [
          {
            id: 'links',
            type: 'social-links',
            visible: true,
            config: {
              links: [
                { label: 'evil', url: 'javascript:alert(1)' },
                { label: 'data', url: 'data:text/html,<script>' },
                { label: 'ok', url: 'https://example.com' },
              ],
            },
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const links = res.json().widgets[0].config.links;
    expect(links).toHaveLength(1);
    expect(links[0].url).toBe('https://example.com');
  });

  it('clamps goal progress to 0-100', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/users/@me/board',
      headers: { Authorization: `Bearer ${tokenFor(NETREX_ID, NETREX_USERNAME)}` },
      payload: {
        widgets: [{ id: 'g', type: 'goal', visible: true, config: { title: 'Meta', progress: 250 } }],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().widgets[0].config.progress).toBe(100);
  });

  it('only accepts hex mood colors', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/users/@me/board',
      headers: { Authorization: `Bearer ${tokenFor(NETREX_ID, NETREX_USERNAME)}` },
      payload: {
        widgets: [{ id: 'm', type: 'mood', visible: true, config: { text: 'bien', color: 'red; background:url(x)' } }],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().widgets[0].config.color).toBeUndefined();
  });
});

describe('GET /api/users/:id — board visibility', () => {
  it('exposes profileBoard to any authenticated viewer', async () => {
    await app.inject({
      method: 'PUT',
      url: '/api/users/@me/board',
      headers: { Authorization: `Bearer ${tokenFor(NETREX_ID, NETREX_USERNAME)}` },
      payload: {
        widgets: [{ id: 'q', type: 'quote', visible: true, config: { text: 'showcase' } }],
      },
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/users/${NETREX_ID}`,
      headers: { Authorization: `Bearer ${tokenFor(USER_ID, USER_USERNAME)}` },
    });
    expect(res.statusCode).toBe(200);
    const user = res.json();
    expect(user.profileBoard).toHaveLength(1);
    expect(user.profileBoard[0].config.text).toBe('showcase');
  });
});

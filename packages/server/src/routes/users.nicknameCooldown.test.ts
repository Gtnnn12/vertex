import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

setWorkerId(24);
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
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const sqlText = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const stmt of sqlText.split(/-->\s*statement-breakpoint/)) {
      const clean = stmt.trim();
      if (clean) db.exec(clean);
    }
  }
  // The profile-board column comes from the runtime ensureColumn migration,
  // not a drizzle file — mirror it so the users insert (drizzle schema now
  // includes profileBoard) works in this test's in-memory DB too.
  try {
    db.prepare('SELECT profile_board FROM users LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE users ADD COLUMN profile_board TEXT');
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
const USER_USERNAME = 'nicktester';

// beforeEach seeds a fresh default row; tests call seedUser with overrides to
// vary it (an UPDATE — the username UNIQUE constraint forbids re-INSERT).
function seedUser(overrides: Partial<typeof schema.users.$inferInsert> = {}): void {
  if (Object.keys(overrides).length > 0) {
    testDb.update(schema.users).set(overrides).where(eq(schema.users.id, USER_ID)).run();
  }
}

function tokenFor(): string {
  return signJwt({ userId: USER_ID, username: USER_USERNAME });
}

function patchMe(payload: Record<string, unknown>) {
  return app.inject({
    method: 'PATCH',
    url: '/api/users/@me',
    headers: { Authorization: `Bearer ${tokenFor()}` },
    payload,
  });
}

function row() {
  return testDb.select().from(schema.users).where(eq(schema.users.id, USER_ID)).get();
}

const DAY_MS = 24 * 60 * 60 * 1000;
const COOLDOWN_MS = 15 * DAY_MS;

beforeEach(async () => {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  applyMigrations(sqlite);
  testDb = drizzle(sqlite, { schema });
  testDb.insert(schema.users).values({
    id: USER_ID,
    username: USER_USERNAME,
    displayName: 'OldName',
    passwordHash: 'x',
    isDeleted: 0,
    homeInstance: null,
    createdAt: Date.now(),
  }).run();
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
  sqlite.close();
});

describe('PATCH /api/users/@me — nickname 15-day cooldown', () => {
  it('allows the FIRST-ever change when nicknameChangedAt is null', async () => {
    const res = await patchMe({ displayName: 'NewName' });
    expect(res.statusCode).toBe(200);
    const r = row();
    expect(r?.displayName).toBe('NewName');
    expect(r?.nicknameChangedAt).toBeGreaterThan(0);
  });

  it('rejects a change within 15 days with 400 + nextAllowedAt', async () => {
    const threeDaysAgo = Date.now() - 3 * DAY_MS;
    seedUser({ nicknameChangedAt: threeDaysAgo });
    const res = await patchMe({ displayName: 'NewName' });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBeTruthy();
    expect(body.nextAllowedAt).toBe(threeDaysAgo + COOLDOWN_MS);
    // Value must NOT be written
    expect(row()?.displayName).toBe('OldName');
  });

  it('allows a change after the cooldown window has elapsed', async () => {
    const sixteenDaysAgo = Date.now() - 16 * DAY_MS;
    seedUser({ nicknameChangedAt: sixteenDaysAgo });
    const res = await patchMe({ displayName: 'NewName' });
    expect(res.statusCode).toBe(200);
    const r = row();
    expect(r?.displayName).toBe('NewName');
    expect(r?.nicknameChangedAt).toBeGreaterThanOrEqual(sixteenDaysAgo);
  });

  it('does NOT restart the cooldown when the nickname is unchanged', async () => {
    const threeDaysAgo = Date.now() - 3 * DAY_MS;
    seedUser({ nicknameChangedAt: threeDaysAgo });
    const res = await patchMe({ displayName: 'OldName' });
    expect(res.statusCode).toBe(200);
    // nicknameChangedAt must NOT be restamped — same value never restarts the window
    expect(row()?.nicknameChangedAt).toBe(threeDaysAgo);
  });

  it('rejects names longer than 32 chars', async () => {
    const res = await patchMe({ displayName: 'x'.repeat(33) });
    expect(res.statusCode).toBe(400);
  });

  it('rejects names shorter than 2 chars', async () => {
    const res = await patchMe({ displayName: 'a' });
    expect(res.statusCode).toBe(400);
  });

  it('rejects names with invalid characters', async () => {
    const res = await patchMe({ displayName: 'bad<script>' });
    expect(res.statusCode).toBe(400);
  });

  it('accepts accented letters, digits, spaces and handle punctuation', async () => {
    const res = await patchMe({ displayName: "Ángel Núñez O'Brien_2" });
    expect(res.statusCode).toBe(200);
  });
});

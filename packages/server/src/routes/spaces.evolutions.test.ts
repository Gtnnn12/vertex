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

setWorkerId(31);
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

vi.mock('../ws/handler.js', () => ({
  connectionManager: {
    sendToUser: vi.fn(),
    sendToSpace: vi.fn(),
    sendToDmMembers: vi.fn(),
    setUserShowActivity: vi.fn(),
    clearUserActivities: vi.fn(),
    getUserStatus: vi.fn(() => 'online'),
    forceDisconnectUser: vi.fn(),
    getUserSpaceEntries: vi.fn(() => new Map()),
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
  // Columns that come from the runtime ensureColumn migration rather than a
  // drizzle file — mirror them so the drizzle-schema inserts work here.
  try {
    db.prepare('SELECT profile_board FROM users LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE users ADD COLUMN profile_board TEXT');
  }
}

async function buildApp(): Promise<FastifyInstance> {
  const { spaceRoutes } = await import('./spaces.js');
  const { channelRoutes } = await import('./channels.js');
  const f = Fastify({ logger: false });
  await f.register(spaceRoutes);
  await f.register(channelRoutes);
  await f.ready();
  return f;
}

const OWNER_ID = 'owner-1';
const OTHER_ID = 'member-1';
const USERNAME = 'evotester';
const SPACE_ID = 'space-1';

// The channel POST handler calls permission helpers against the same DB.
// computePermissions walks space_members + roles; the owner gets
// MANAGE_CHANNELS via ADMINISTRATOR from the @everyone role defaults set up
// below. The non-owner member only gets the @everyone defaults too, so we
// grant them MANAGE_CHANNELS via an explicit role to prove the limit applies
// to ANY manager, not just owners.
function seedBase(): void {
  testDb.insert(schema.users).values([
    {
      id: OWNER_ID,
      username: USERNAME,
      displayName: 'Owner',
      passwordHash: 'x',
      isDeleted: 0,
      homeInstance: null,
      createdAt: Date.now(),
    },
    {
      id: OTHER_ID,
      username: 'evomember',
      displayName: 'Member',
      passwordHash: 'x',
      isDeleted: 0,
      homeInstance: null,
      createdAt: Date.now(),
    },
  ]).run();

  testDb.insert(schema.spaces).values({
    id: SPACE_ID,
    name: 'Evo Space',
    ownerId: OWNER_ID,
    createdAt: Date.now(),
  }).run();

  testDb.insert(schema.spaceMembers).values([
    { spaceId: SPACE_ID, userId: OWNER_ID, joinedAt: Date.now() },
    { spaceId: SPACE_ID, userId: OTHER_ID, joinedAt: Date.now() },
  ]).run();
}

function setOwnerNetrex(active: boolean): void {
  testDb.update(schema.users)
    .set(active ? { netrexEnabled: 1, netrexUntil: null } : { netrexEnabled: 0, netrexUntil: null })
    .where(eq(schema.users.id, OWNER_ID))
    .run();
}

function setEvoLevel(level: number): void {
  testDb.update(schema.spaces)
    .set({ serverEvoLevel: level })
    .where(eq(schema.spaces.id, SPACE_ID))
    .run();
}

function tokenFor(userId: string): string {
  return signJwt({ userId, username: USERNAME });
}

function evolve(payload: Record<string, unknown>, userId = OWNER_ID) {
  return app.inject({
    method: 'POST',
    url: `/api/spaces/${SPACE_ID}/evolution`,
    headers: { Authorization: `Bearer ${tokenFor(userId)}` },
    payload,
  });
}

function createChannel(type: 'text' | 'voice', name: string, userId = OWNER_ID) {
  return app.inject({
    method: 'POST',
    url: `/api/spaces/${SPACE_ID}/channels`,
    headers: { Authorization: `Bearer ${tokenFor(userId)}` },
    payload: { name, type },
  });
}

function channelCountByType(type: 'text' | 'voice'): number {
  return testDb.select()
    .from(schema.channels)
    .where(eq(schema.channels.spaceId, SPACE_ID))
    .all()
    .filter((c) => c.type === type).length;
}

beforeEach(async () => {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  applyMigrations(sqlite);
  testDb = drizzle(sqlite, { schema });
  seedBase();
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
  sqlite.close();
});

describe('POST /api/spaces/:id/evolution', () => {
  it('evolves to level 1 when the owner has an active Netrex grant', async () => {
    setOwnerNetrex(true);
    const res = await evolve({ targetLevel: 1 });
    expect(res.statusCode).toBe(200);
    expect(res.json().serverEvoLevel).toBe(1);
    expect(testDb.select().from(schema.spaces).where(eq(schema.spaces.id, SPACE_ID)).get()?.serverEvoLevel).toBe(1);
  });

  it('rejects evolution with 403 netrex_required when the owner lacks Netrex', async () => {
    setOwnerNetrex(false);
    const res = await evolve({ targetLevel: 1 });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('netrex_required');
    expect(testDb.select().from(schema.spaces).where(eq(schema.spaces.id, SPACE_ID)).get()?.serverEvoLevel).toBe(0);
  });

  it('rejects an expired Netrex grant', async () => {
    testDb.update(schema.users)
      .set({ netrexEnabled: 1, netrexUntil: Date.now() - 1000 })
      .where(eq(schema.users.id, OWNER_ID))
      .run();
    const res = await evolve({ targetLevel: 1 });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('netrex_required');
  });

  it('accepts a purchased plan (netrexUntil in the future)', async () => {
    testDb.update(schema.users)
      .set({ netrexEnabled: 0, netrexUntil: Date.now() + 30 * 24 * 60 * 60 * 1000 })
      .where(eq(schema.users.id, OWNER_ID))
      .run();
    const res = await evolve({ targetLevel: 1 });
    expect(res.statusCode).toBe(200);
    expect(res.json().serverEvoLevel).toBe(1);
  });

  it('is owner-only (a MANAGE_CHANNELS admin cannot evolve)', async () => {
    setOwnerNetrex(true);
    const res = await evolve({ targetLevel: 1 }, OTHER_ID);
    expect(res.statusCode).toBe(403);
  });

  it('rejects invalid targetLevel values', async () => {
    setOwnerNetrex(true);
    expect((await evolve({ targetLevel: 3 })).statusCode).toBe(400);
    expect((await evolve({ targetLevel: 0 })).statusCode).toBe(400);
    expect((await evolve({})).statusCode).toBe(400);
  });

  it('rejects going backwards (targetLevel <= stored level)', async () => {
    setOwnerNetrex(true);
    setEvoLevel(2);
    const res = await evolve({ targetLevel: 1 });
    expect(res.statusCode).toBe(400);
  });

  it('FREEZE RULE: Netrex lapse does not downgrade the stored level', async () => {
    setOwnerNetrex(true);
    setEvoLevel(2);
    setOwnerNetrex(false);
    const state = testDb.select().from(schema.spaces).where(eq(schema.spaces.id, SPACE_ID)).get();
    expect(state?.serverEvoLevel).toBe(2);
    // And the GET still reports the stored level (frozen, not wiped)
    const res = await app.inject({
      method: 'GET',
      url: `/api/spaces/${SPACE_ID}`,
      headers: { Authorization: `Bearer ${tokenFor(OWNER_ID)}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().serverEvoLevel).toBe(2);
  });
});

describe('Server Evolutions channel limits (POST /api/spaces/:id/channels)', () => {
  it('enforces the base limit (10 text) when level is 0', async () => {
    setOwnerNetrex(false);
    setEvoLevel(0);
    for (let i = 0; i < 10; i++) {
      const res = await createChannel('text', `texto-${i}`);
      expect(res.statusCode).toBe(201);
    }
    const res = await createChannel('text', 'texto-11');
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('evo_limit_base_upgrade');
    expect(channelCountByType('text')).toBe(10);
  });

  it('enforces the base voice limit (5) independently of text', async () => {
    setOwnerNetrex(false);
    setEvoLevel(0);
    for (let i = 0; i < 5; i++) {
      expect((await createChannel('voice', `voz-${i}`)).statusCode).toBe(201);
    }
    expect((await createChannel('voice', 'voz-6')).statusCode).toBe(403);
    // Text still has room
    expect((await createChannel('text', 'texto-1')).statusCode).toBe(201);
  });

  it('allows level-1 limits (20 text) only while Netrex is active', async () => {
    setOwnerNetrex(true);
    setEvoLevel(1);
    for (let i = 0; i < 20; i++) {
      expect((await createChannel('text', `t-${i}`)).statusCode).toBe(201);
    }
    expect((await createChannel('text', 't-21')).statusCode).toBe(403);
    expect((await createChannel('text', 't-21')).json().code).toBe('evo_limit_reached');
  });

  it('freeze rule at creation: level 2 with lapsed Netrex clamps to base limits', async () => {
    setOwnerNetrex(true);
    setEvoLevel(2);
    setOwnerNetrex(false);
    // Level is frozen at 2, but effective enforcement is base: 11th text channel is rejected
    for (let i = 0; i < 10; i++) {
      expect((await createChannel('text', `ft-${i}`)).statusCode).toBe(201);
    }
    const res = await createChannel('text', 'ft-11');
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('evo_limit_base_upgrade');
  });

  it('allows level-2 limits (35 text) with active Netrex', async () => {
    setOwnerNetrex(true);
    setEvoLevel(2);
    for (let i = 0; i < 35; i++) {
      expect((await createChannel('text', `lv2-${i}`)).statusCode).toBe(201);
    }
    expect((await createChannel('text', 'lv2-36')).statusCode).toBe(403);
    expect(channelCountByType('text')).toBe(35);
  });
});

describe('Netrex cosmetic gate — space banner (PATCH /api/spaces/:id)', () => {
  it('stores the banner when the owner has Netrex', async () => {
    setOwnerNetrex(true);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/spaces/${SPACE_ID}`,
      headers: { Authorization: `Bearer ${tokenFor(OWNER_ID)}` },
      payload: { banner: '/api/uploads/banner.png' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().banner).toBe('/api/uploads/banner.png');
  });

  it('silently clears the banner when the owner lacks Netrex (200, no error)', async () => {
    setOwnerNetrex(false);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/spaces/${SPACE_ID}`,
      headers: { Authorization: `Bearer ${tokenFor(OWNER_ID)}` },
      payload: { banner: '/api/uploads/banner.png' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().banner).toBeNull();
  });
});

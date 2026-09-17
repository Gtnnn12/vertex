import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, gt } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from '../db/schema.js';
import { setWorkerId } from '../utils/snowflake.js';
import { signJwt } from '../utils/auth.js';
import { DEFAULT_EVERYONE_PERMISSIONS, permissionsToString } from '@backspace/shared/src/permissions.js';

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
    sendToChannel: vi.fn(),
    setUserShowActivity: vi.fn(),
    clearUserActivities: vi.fn(),
    getUserStatus: vi.fn(() => 'online'),
    forceDisconnectUser: vi.fn(),
    getUserSpaceEntries: vi.fn(() => new Map()),
    addUserSpace: vi.fn(),
    pushReadyPayload: vi.fn(),
    clearVoiceUserStatus: vi.fn(),
    getRoomParticipants: vi.fn(() => []),
    leaveRoom: vi.fn(),
    getAllRooms: vi.fn(() => []),
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
  const { spaceEvolutionRoutes } = await import('./spaceEvolution.js');
  const { netrexRoutes } = await import('./netrex.js');
  const f = Fastify({ logger: false });
  await f.register(spaceRoutes);
  await f.register(channelRoutes);
  await f.register(spaceEvolutionRoutes);
  await f.register(netrexRoutes);
  await f.ready();
  return f;
}

const OWNER_ID = 'owner-1';
const MEMBER_ID = 'member-1';
const USERNAME = 'evotester';
const SPACE_ID = 'space-1';

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
      id: MEMBER_ID,
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
    { spaceId: SPACE_ID, userId: MEMBER_ID, joinedAt: Date.now() },
  ]).run();
}

function grantCredits(userId: string, credits: number): void {
  const existing = testDb.select().from(schema.boostCredits).where(eq(schema.boostCredits.userId, userId)).get();
  if (existing) {
    testDb.update(schema.boostCredits).set({ credits, updatedAt: Date.now() })
      .where(eq(schema.boostCredits.userId, userId)).run();
  } else {
    testDb.insert(schema.boostCredits).values({ userId, credits, updatedAt: Date.now() }).run();
  }
}

function tokenFor(userId: string): string {
  return signJwt({ userId, username: USERNAME });
}

function boost(userId = MEMBER_ID) {
  return app.inject({
    method: 'POST',
    url: `/api/spaces/${SPACE_ID}/boost`,
    headers: { Authorization: `Bearer ${tokenFor(userId)}` },
    payload: {},
  });
}

function getBoosts(userId = MEMBER_ID) {
  return app.inject({
    method: 'GET',
    url: `/api/spaces/${SPACE_ID}/boosts`,
    headers: { Authorization: `Bearer ${tokenFor(userId)}` },
  });
}

function getEvolution(userId = MEMBER_ID) {
  return app.inject({
    method: 'GET',
    url: `/api/spaces/${SPACE_ID}/evolution`,
    headers: { Authorization: `Bearer ${tokenFor(userId)}` },
  });
}

function activeBoostCount(): number {
  return testDb.select()
    .from(schema.spaceBoosts)
    .where(eq(schema.spaceBoosts.spaceId, SPACE_ID))
    .all()
    .filter((r) => r.expiresAt > Date.now()).length;
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

describe('POST /api/spaces/:id/boost — compra por cualquier MIEMBRO', () => {
  it('a normal member (not the owner) can boost with one credit', async () => {
    grantCredits(MEMBER_ID, 1);
    const res = await boost();
    expect(res.statusCode).toBe(201);
    expect(res.json().activeBoosts).toBe(1);
    expect(res.json().serverEvoLevel).toBe(0); // 1 boost < 4 → base
    expect(activeBoostCount()).toBe(1);
    // Credit consumed
    expect(testDb.select().from(schema.boostCredits).where(eq(schema.boostCredits.userId, MEMBER_ID)).get()?.credits).toBe(0);
  });

  it('rejects without credits (402 no_boost_credits) and consumes nothing', async () => {
    const res = await boost();
    expect(res.statusCode).toBe(402);
    expect(res.json().code).toBe('no_boost_credits');
    expect(activeBoostCount()).toBe(0);
  });

  it('rejects non-members (403 not_member)', async () => {
    testDb.insert(schema.users).values({
      id: 'outsider',
      username: 'outsider',
      displayName: 'Outsider',
      passwordHash: 'x',
      isDeleted: 0,
      homeInstance: null,
      createdAt: Date.now(),
    }).run();
    // outsider has credits but no membership
    grantCredits('outsider', 1);
    const res = await app.inject({
      method: 'POST',
      url: `/api/spaces/${SPACE_ID}/boost`,
      headers: { Authorization: `Bearer ${tokenFor('outsider')}` },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('not_member');
    expect(activeBoostCount()).toBe(0);
  });

  it('the OWNER can also boost (any member, owner included)', async () => {
    grantCredits(OWNER_ID, 1);
    const res = await boost(OWNER_ID);
    expect(res.statusCode).toBe(201);
  });

  it('a member WITHOUT Netrex can purchase: 201, boost registered, N1 at 4', async () => {
    // Multicuenta-style member: never had Netrex, not the owner.
    testDb.update(schema.users)
      .set({ netrexEnabled: 0, netrexUntil: null, netrexExpiresAt: null })
      .where(eq(schema.users.id, MEMBER_ID))
      .run();
    grantCredits(MEMBER_ID, 4);
    for (let i = 0; i < 4; i++) {
      const res = await boost(MEMBER_ID);
      expect(res.statusCode).toBe(201);
      expect(res.json().boost.userId).toBe(MEMBER_ID);
    }
    expect(activeBoostCount()).toBe(4);
    expect((await getEvolution(MEMBER_ID)).json().effectiveLevel).toBe(1);
  });

  it('expires 30 days out', async () => {
    grantCredits(MEMBER_ID, 1);
    const before = Date.now();
    const res = await boost();
    const row = testDb.select().from(schema.spaceBoosts).where(eq(schema.spaceBoosts.spaceId, SPACE_ID)).get()!;
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    expect(row.expiresAt).toBeGreaterThanOrEqual(before + thirtyDays - 1000);
    expect(row.expiresAt).toBeLessThanOrEqual(Date.now() + thirtyDays + 1000);
    expect(res.json().boost.expiresAt).toBe(row.expiresAt);
  });

  it('level rises with each purchase: 4 boosts → N1, 10 → N2', async () => {
    grantCredits(MEMBER_ID, 10);
    grantCredits(OWNER_ID, 1);

    for (let i = 0; i < 3; i++) {
      const res = await boost();
      expect(res.json().serverEvoLevel).toBe(0);
    }
    const res4 = await boost(OWNER_ID);
    expect(res4.json().activeBoosts).toBe(4);
    expect(res4.json().serverEvoLevel).toBe(1);
    expect(res4.json().previousLevel).toBe(0);

    for (let i = 0; i < 5; i++) {
      await boost();
    }
    const res10 = await boost();
    expect(res10.json().activeBoosts).toBe(10);
    expect(res10.json().serverEvoLevel).toBe(2);
    expect(res10.json().previousLevel).toBe(1);
  });
});

describe('Server Booster role', () => {
  it('assigns an idempotent "Server Booster" role to the buyer on purchase', async () => {
    grantCredits(MEMBER_ID, 3);
    await boost();
    await boost();
    await boost();

    const roleId = `${SPACE_ID}:booster`;
    const role = testDb.select().from(schema.roles).where(eq(schema.roles.id, roleId)).get();
    expect(role).toBeTruthy();
    expect(role!.name).toBe('Server Booster');
    // CERO permisos extra: solo el baseline @everyone.
    expect(role!.permissions).toBe(permissionsToString(DEFAULT_EVERYONE_PERMISSIONS));

    const assignments = testDb.select()
      .from(schema.memberRoles)
      .where(eq(schema.memberRoles.userId, MEMBER_ID))
      .all()
      .filter((r) => r.roleId === roleId);
    expect(assignments.length).toBe(1); // idempotent — no duplicates
  });

  it('the booster role is visible in the member list', async () => {
    grantCredits(MEMBER_ID, 1);
    await boost();
    const res = await app.inject({
      method: 'GET',
      url: `/api/spaces/${SPACE_ID}/members`,
      headers: { Authorization: `Bearer ${tokenFor(OWNER_ID)}` },
    });
    const members = res.json() as { userId: string; roles: { name: string }[] }[];
    const member = members.find((m) => m.userId === MEMBER_ID)!;
    expect(member.roles.some((r) => r.name === 'Server Booster')).toBe(true);
  });
});

describe('Boost state endpoint (GET /api/spaces/:id/boosts)', () => {
  it('reports active count, per-member boosts and credits', async () => {
    grantCredits(MEMBER_ID, 2);
    await boost();
    await boost();
    const res = await getBoosts();
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.activeBoosts).toBe(2);
    expect(body.myBoosts).toBe(2);
    expect(body.myCredits).toBe(0);
    expect(body.boostsForLevel1).toBe(4);
    expect(body.boostsForLevel2).toBe(10);
    expect(body.nextExpiryAt).toBeGreaterThan(Date.now());
  });

  it('rejects non-members', async () => {
    testDb.insert(schema.users).values({
      id: 'outsider',
      username: 'outsider',
      displayName: 'Outsider',
      passwordHash: 'x',
      isDeleted: 0,
      homeInstance: null,
      createdAt: Date.now(),
    }).run();
    const res = await app.inject({
      method: 'GET',
      url: `/api/spaces/${SPACE_ID}/boosts`,
      headers: { Authorization: `Bearer ${tokenFor('outsider')}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('EXPIRACIÓN + FREEZE RULE (nada se borra, se clampa al base)', () => {
  it('expired boosts stop counting and effective level clamps to base', async () => {
    grantCredits(MEMBER_ID, 5);
    for (let i = 0; i < 4; i++) await boost();
    expect(activeBoostCount()).toBe(4);
    expect((await getEvolution()).json().effectiveLevel).toBe(1);

    // Simulate expiry: backdate all rows. Rows are NEVER deleted.
    const now = Date.now();
    testDb.update(schema.spaceBoosts)
      .set({ expiresAt: now - 1000 })
      .where(eq(schema.spaceBoosts.spaceId, SPACE_ID))
      .run();

    const evo = (await getEvolution()).json();
    expect(evo.effectiveLevel).toBe(0);
    // Freeze rule: the rows survive
    expect(testDb.select().from(schema.spaceBoosts).where(eq(schema.spaceBoosts.spaceId, SPACE_ID)).all().length).toBe(4);
  });

  it('partial expiry de-factors only expired boosts (4 → 3 drops to base)', async () => {
    grantCredits(MEMBER_ID, 5);
    for (let i = 0; i < 4; i++) await boost();
    const rows = testDb.select().from(schema.spaceBoosts).where(eq(schema.spaceBoosts.spaceId, SPACE_ID)).all();
    testDb.update(schema.spaceBoosts)
      .set({ expiresAt: Date.now() - 1000 })
      .where(eq(schema.spaceBoosts.id, rows[0]!.id))
      .run();
    const body = (await getBoosts()).json();
    expect(body.activeBoosts).toBe(3);
    expect(body.effectiveLevel).toBe(0);
  });

  it('channel creation clamps to base limits when boosts expire (freeze at write time)', async () => {
    grantCredits(MEMBER_ID, 5);
    for (let i = 0; i < 4; i++) await boost();
    // Level 1 → 20 text channels allowed; create 20
    for (let i = 0; i < 20; i++) {
      expect((await createChannel('text', `lv1-${i}`)).statusCode).toBe(201);
    }
    // Boosts expire → effective clamps to base (10) → creation blocked
    testDb.update(schema.spaceBoosts)
      .set({ expiresAt: Date.now() - 1000 })
      .where(eq(schema.spaceBoosts.spaceId, SPACE_ID))
      .run();
    const res = await createChannel('text', 'lv1-20');
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('evo_limit_base_upgrade');
    // Nothing was deleted: existing 20 channels survive
    expect(channelCountByType('text')).toBe(20);
  });

  it('re-boosting after expiry raises the level again', async () => {
    grantCredits(MEMBER_ID, 9);
    for (let i = 0; i < 4; i++) await boost();
    const rows = testDb.select().from(schema.spaceBoosts).where(eq(schema.spaceBoosts.spaceId, SPACE_ID)).all();
    testDb.update(schema.spaceBoosts)
      .set({ expiresAt: Date.now() - 1000 })
      .where(eq(schema.spaceBoosts.spaceId, SPACE_ID))
      .run();
    expect((await getEvolution()).json().effectiveLevel).toBe(0);
    // Revive (like buying again)
    testDb.update(schema.spaceBoosts)
      .set({ expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 })
      .where(eq(schema.spaceBoosts.spaceId, SPACE_ID))
      .run();
    expect((await getEvolution()).json().effectiveLevel).toBe(1);
  });
});

describe('Evolutions catalog gates (por nivel derivado de boosts)', () => {
  it('custom emojis need level 1 (evo_required at base)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/spaces/${SPACE_ID}/emojis`,
      headers: { Authorization: `Bearer ${tokenFor(OWNER_ID)}` },
      payload: { name: 'party', file: '/api/uploads/e.png' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('evo_required');
  });

  it('custom emojis unlock at 4 active boosts (level 1)', async () => {
    grantCredits(MEMBER_ID, 5);
    for (let i = 0; i < 4; i++) await boost();
    const res = await app.inject({
      method: 'POST',
      url: `/api/spaces/${SPACE_ID}/emojis`,
      headers: { Authorization: `Bearer ${tokenFor(OWNER_ID)}` },
      payload: { name: 'party', file: '/api/uploads/e.png' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('evolution endpoint reports derived level and boost count', async () => {
    grantCredits(MEMBER_ID, 5);
    for (let i = 0; i < 4; i++) await boost();
    const body = (await getEvolution()).json();
    expect(body.serverEvoLevel).toBe(1);
    expect(body.effectiveLevel).toBe(1);
    expect(body.activeBoosts).toBe(4);
    expect(body.benefits.banner).toBe(true);
    expect(body.benefits.spaceStats).toBe(false);
  });

  it('space GET carries the derived level (not the stored column)', async () => {
    // Legacy stored level is ignored — must stay 0 in DB
    expect(testDb.select().from(schema.spaces).where(eq(schema.spaces.id, SPACE_ID)).get()?.serverEvoLevel).toBe(0);
    grantCredits(MEMBER_ID, 5);
    for (let i = 0; i < 4; i++) await boost();
    const res = await app.inject({
      method: 'GET',
      url: `/api/spaces/${SPACE_ID}`,
      headers: { Authorization: `Bearer ${tokenFor(OWNER_ID)}` },
    });
    expect(res.json().serverEvoLevel).toBe(1);
  });
});

describe('Billing webhook — boost credits', () => {
  async function sendPing(form: Record<string, string>) {
    return app.inject({
      method: 'POST',
      url: '/api/webhooks/gumroad',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams(form).toString(),
    });
  }

  it('routes boost product sales to +1 credit (not Netrex)', async () => {
    process.env.BOOST_PRODUCT_ID = 'boost-product-1';
    try {
      testDb.update(schema.users).set({ billingEmail: 'buyer@example.com' }).where(eq(schema.users.id, MEMBER_ID)).run();
      const res = await sendPing({
        product_id: 'boost-product-1',
        email: 'buyer@example.com',
        seller_id: 's1',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().boostCredit).toBe(true);
      // No Netrex granted
      const user = testDb.select().from(schema.users).where(eq(schema.users.id, MEMBER_ID)).get()!;
      expect(user.netrexEnabled).toBe(0);
      // Credit granted
      expect(testDb.select().from(schema.boostCredits).where(eq(schema.boostCredits.userId, MEMBER_ID)).get()?.credits).toBe(1);
    } finally {
      delete process.env.BOOST_PRODUCT_ID;
    }
  });

  it('boost product refund expires the buyer’s most recent active boost', async () => {
    process.env.BOOST_PRODUCT_ID = 'boost-product-1';
    try {
      testDb.update(schema.users).set({ billingEmail: 'buyer@example.com' }).where(eq(schema.users.id, MEMBER_ID)).run();
      grantCredits(MEMBER_ID, 1);
      await boost(); // 1 active boost

      const res = await sendPing({
        product_id: 'boost-product-1',
        email: 'buyer@example.com',
        refunded: 'true',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().revoked).toBe(true);

      const rows = testDb.select().from(schema.spaceBoosts).where(eq(schema.spaceBoosts.userId, MEMBER_ID)).all();
      expect(rows.length).toBe(1); // freeze rule: row kept
      expect(rows[0]!.expiresAt).toBeLessThanOrEqual(Date.now()); // but expired
    } finally {
      delete process.env.BOOST_PRODUCT_ID;
    }
  });
});

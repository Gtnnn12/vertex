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
  try {
    db.prepare('SELECT profile_board FROM users LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE users ADD COLUMN profile_board TEXT');
  }
}

async function buildApp(): Promise<FastifyInstance> {
  const { creditsRoutes } = await import('./credits.js');
  const { netrexRoutes } = await import('./netrex.js');
  const f = Fastify({ logger: false });
  await f.register(creditsRoutes);
  await f.register(netrexRoutes);
  await f.ready();
  return f;
}

const USER_ID = 'wallet-user';
const USERNAME = 'walleter';
const EMAIL = 'wallet@example.com';

function tokenFor(userId: string): string {
  return signJwt({ userId, username: USERNAME });
}

beforeEach(async () => {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  applyMigrations(sqlite);
  testDb = drizzle(sqlite, { schema });
  testDb.insert(schema.users).values({
    id: USER_ID,
    username: USERNAME,
    displayName: 'Wallet',
    passwordHash: 'x',
    isDeleted: 0,
    homeInstance: null,
    createdAt: Date.now(),
    billingEmail: EMAIL,
  }).run();
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
  sqlite.close();
});

function balance(): number {
  return testDb.select().from(schema.users).where(eq(schema.users.id, USER_ID)).get()!.creditBalance;
}

function txnCount(): number {
  return testDb.select().from(schema.creditTransactions).where(eq(schema.creditTransactions.userId, USER_ID)).all().length;
}

describe('GET /api/credits/balance', () => {
  it('starts at 0 for a fresh user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/credits/balance',
      headers: { Authorization: `Bearer ${tokenFor(USER_ID)}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().balance).toBe(0);
  });
});

describe('POST /api/credits/purchase', () => {
  it('returns the pack checkout without crediting anything', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/credits/purchase',
      headers: { Authorization: `Bearer ${tokenFor(USER_ID)}` },
      payload: { packId: 'pack_2' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().packId).toBe('pack_2');
    // El crédito NO se añade por el front: solo el webhook acredita.
    expect(balance()).toBe(0);
    expect(txnCount()).toBe(0);
  });

  it('rejects an invalid pack with 400 invalid_pack', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/credits/purchase',
      headers: { Authorization: `Bearer ${tokenFor(USER_ID)}` },
      payload: { packId: 'pack_999' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('invalid_pack');
  });
});

describe('Webhook — credit packs acreditan el monedero', () => {
  async function sendPing(form: Record<string, string>) {
    return app.inject({
      method: 'POST',
      url: '/api/webhooks/gumroad',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams(form).toString(),
    });
  }

  it('pack_5 sale credits 275 (bonus 10%) with an audit row', async () => {
    process.env.CREDIT_PACK_PRODUCT_PACK_5 = 'credit-product-5';
    try {
      const res = await sendPing({ product_id: 'credit-product-5', email: EMAIL });
      expect(res.statusCode).toBe(200);
      expect(res.json().creditPack).toBe('pack_5');
      expect(balance()).toBe(275);
      const txns = testDb.select().from(schema.creditTransactions)
        .where(eq(schema.creditTransactions.userId, USER_ID)).all();
      expect(txns.length).toBe(1);
      expect(txns[0]!.amount).toBe(275);
      expect(txns[0]!.reason).toBe('topup:pack_5');
    } finally {
      delete process.env.CREDIT_PACK_PRODUCT_PACK_5;
    }
  });

  it('pack_10 credits 600 and a second sale accumulates', async () => {
    process.env.CREDIT_PACK_PRODUCT_PACK_10 = 'credit-product-10';
    try {
      await sendPing({ product_id: 'credit-product-10', email: EMAIL });
      await sendPing({ product_id: 'credit-product-10', email: EMAIL });
      expect(balance()).toBe(1200);
      expect(txnCount()).toBe(2);
    } finally {
      delete process.env.CREDIT_PACK_PRODUCT_PACK_10;
    }
  });

  it('refund debits the pack with its own audit row', async () => {
    process.env.CREDIT_PACK_PRODUCT_PACK_2 = 'credit-product-2';
    try {
      await sendPing({ product_id: 'credit-product-2', email: EMAIL });
      expect(balance()).toBe(100);
      await sendPing({ product_id: 'credit-product-2', email: EMAIL, refunded: 'true' });
      expect(balance()).toBe(0);
      const txns = testDb.select().from(schema.creditTransactions)
        .where(eq(schema.creditTransactions.userId, USER_ID)).all();
      expect(txns.length).toBe(2);
      expect(txns.some((t) => t.reason === 'refund:pack_2' && t.amount === -100)).toBe(true);
    } finally {
      delete process.env.CREDIT_PACK_PRODUCT_PACK_2;
    }
  });

  it('refund never drives the balance negative if credits were already spent', async () => {
    process.env.CREDIT_PACK_PRODUCT_PACK_2 = 'credit-product-2';
    try {
      await sendPing({ product_id: 'credit-product-2', email: EMAIL });
      // User spends 100 on something else
      const { creditWallet } = await import('./credits.js');
      creditWallet({ userId: USER_ID, amount: -100, reason: 'spend:test' });
      expect(balance()).toBe(0);
      await sendPing({ product_id: 'credit-product-2', email: EMAIL, refunded: 'true' });
      expect(balance()).toBe(0); // clamped, never negative
    } finally {
      delete process.env.CREDIT_PACK_PRODUCT_PACK_2;
    }
  });

  it('pack sale for unknown email is rejected without crediting anyone', async () => {
    process.env.CREDIT_PACK_PRODUCT_PACK_2 = 'credit-product-2';
    try {
      const res = await sendPing({ product_id: 'credit-product-2', email: 'nobody@example.com' });
      expect(res.json().error).toBe('unknown_user');
      expect(balance()).toBe(0);
    } finally {
      delete process.env.CREDIT_PACK_PRODUCT_PACK_2;
    }
  });
});

describe('POST /api/credits/purchase-netrex', () => {
  it('600 credits → 1 month of Netrex, audited, entitlement extended', async () => {
    const { creditWallet } = await import('./credits.js');
    creditWallet({ userId: USER_ID, amount: 600, reason: 'topup:pack_10' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/credits/purchase-netrex',
      headers: { Authorization: `Bearer ${tokenFor(USER_ID)}` },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.plan).toBe('monthly');
    expect(body.spent).toBe(600);
    expect(balance()).toBe(0);
    const user = testDb.select().from(schema.users).where(eq(schema.users.id, USER_ID)).get()!;
    expect(user.netrexEnabled).toBe(1);
    expect(user.netrexPlan).toBe('monthly');
    expect(user.netrexUntil).toBeGreaterThan(Date.now());
    const txns = testDb.select().from(schema.creditTransactions)
      .where(eq(schema.creditTransactions.userId, USER_ID)).all();
    expect(txns.some((t) => t.reason === 'spend:netrex:monthly' && t.amount === -600)).toBe(true);
  });

  it('insufficient balance → 400 insufficient_credits, entitlement untouched', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/credits/purchase-netrex',
      headers: { Authorization: `Bearer ${tokenFor(USER_ID)}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('insufficient_credits');
    const user = testDb.select().from(schema.users).where(eq(schema.users.id, USER_ID)).get()!;
    expect(user.netrexEnabled).toBe(0);
  });

  it('extends from current expiry when Netrex is already active', async () => {
    const { creditWallet } = await import('./credits.js');
    const futureUntil = Date.now() + 10 * 24 * 60 * 60 * 1000;
    testDb.update(schema.users)
      .set({ netrexEnabled: 1, netrexPlan: 'monthly', netrexUntil: futureUntil })
      .where(eq(schema.users.id, USER_ID)).run();
    creditWallet({ userId: USER_ID, amount: 600, reason: 'topup:pack_10' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/credits/purchase-netrex',
      headers: { Authorization: `Bearer ${tokenFor(USER_ID)}` },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const user = testDb.select().from(schema.users).where(eq(schema.users.id, USER_ID)).get()!;
    // Extended from the remaining time, not from now (~10d + 30d)
    expect(user.netrexUntil).toBeGreaterThan(futureUntil + 29 * 24 * 60 * 60 * 1000);
  });
});

describe('creditWallet helper', () => {
  it('rejects overdraft with 400 insufficient_credits and writes nothing', async () => {
    const { creditWallet } = await import('./credits.js');
    expect(() => creditWallet({ userId: USER_ID, amount: -50, reason: 'spend:test' }))
      .toThrowError(/Insufficient credits/);
    expect(balance()).toBe(0);
    expect(txnCount()).toBe(0);
  });

  it('every movement is audited (no credits without a transaction row)', async () => {
    const { creditWallet } = await import('./credits.js');
    creditWallet({ userId: USER_ID, amount: 600, reason: 'topup:pack_10' });
    creditWallet({ userId: USER_ID, amount: -100, reason: 'spend:boost:space-1' });
    expect(balance()).toBe(500);
    expect(txnCount()).toBe(2);
  });
});

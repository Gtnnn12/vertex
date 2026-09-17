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

setWorkerId(41);
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
  const { registerRechargeRoutes } = await import('./recharge.js');
  const f = Fastify({ logger: false });
  f.setErrorHandler((err, _req, reply) => {
    if (process.env.DEBUG_500) console.error('[500]', err);
    return reply.code(err.statusCode ?? 500).send({ error: err.code ?? err.message });
  });
  await f.register(registerRechargeRoutes);
  await f.ready();
  return f;
}

const USER_ID = 'recharge-user';
const ADMIN_ID = 'recharge-admin';

function tokenFor(userId: string): string {
  return signJwt({ userId, username: userId });
}

beforeEach(async () => {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  applyMigrations(sqlite);
  testDb = drizzle(sqlite, { schema });
  testDb.insert(schema.users).values({
    id: USER_ID,
    username: 'buyer',
    displayName: 'Buyer',
    passwordHash: 'x',
    isAdmin: 0,
    isDeleted: 0,
    homeInstance: null,
    createdAt: Date.now(),
  }).run();
  testDb.insert(schema.users).values({
    id: ADMIN_ID,
    username: 'staff',
    displayName: 'Staff',
    passwordHash: 'x',
    isAdmin: 1,
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

describe('recharge purchase chat (T1 backend)', () => {
  it('creates an open ticket after "Ya he pagado"', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/credits/recharge',
      headers: { authorization: `Bearer ${tokenFor(USER_ID)}` },
      payload: { packId: 'pack_2' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.ticket.status).toBe('open');
    expect(body.ticket.packId).toBe('pack_2');
    expect(body.ticket.userId).toBe(USER_ID);
  });

  it('rejects invalid packs and enforces max 1 open ticket', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: '/api/credits/recharge',
      headers: { authorization: `Bearer ${tokenFor(USER_ID)}` },
      payload: { packId: 'pack_7' },
    });
    expect(bad.statusCode).toBe(400);

    const first = await app.inject({
      method: 'POST',
      url: '/api/credits/recharge',
      headers: { authorization: `Bearer ${tokenFor(USER_ID)}` },
      payload: { packId: 'pack_5' },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: '/api/credits/recharge',
      headers: { authorization: `Bearer ${tokenFor(USER_ID)}` },
      payload: { packId: 'pack_2' },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toBe('ticket_already_open');
  });

  it('returns my ticket with messages; null when none', async () => {
    const none = await app.inject({
      method: 'GET',
      url: '/api/credits/recharge/my',
      headers: { authorization: `Bearer ${tokenFor(USER_ID)}` },
    });
    expect(none.json().ticket).toBeNull();

    await app.inject({
      method: 'POST',
      url: '/api/credits/recharge',
      headers: { authorization: `Bearer ${tokenFor(USER_ID)}` },
      payload: { packId: 'pack_2' },
    });

    const my = await app.inject({
      method: 'GET',
      url: '/api/credits/recharge/my',
      headers: { authorization: `Bearer ${tokenFor(USER_ID)}` },
    });
    const body = my.json();
    expect(body.ticket.packId).toBe('pack_2');
    // Mensaje de sistema de bienvenida en el chat.
    expect(body.messages.length).toBeGreaterThanOrEqual(1);
    expect(body.messages[0].senderRole).toBe('system');
  });

  it('user sends text and screenshot messages to their ticket', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/credits/recharge',
      headers: { authorization: `Bearer ${tokenFor(USER_ID)}` },
      payload: { packId: 'pack_2' },
    });

    const text = await app.inject({
      method: 'POST',
      url: '/api/credits/recharge/my/message',
      headers: { authorization: `Bearer ${tokenFor(USER_ID)}` },
      payload: { body: 'Ya envié los 2€ por PayPal' },
    });
    expect(text.statusCode).toBe(201);
    expect(text.json().message.senderRole).toBe('user');
    expect(text.json().message.body).toContain('PayPal');

    const shot = await app.inject({
      method: 'POST',
      url: '/api/credits/recharge/my/message',
      headers: { authorization: `Bearer ${tokenFor(USER_ID)}` },
      payload: { imageUrl: '/api/uploads/capture-123.png' },
    });
    expect(shot.statusCode).toBe(201);
    expect(shot.json().message.imageUrl).toBe('/api/uploads/capture-123.png');

    const empty = await app.inject({
      method: 'POST',
      url: '/api/credits/recharge/my/message',
      headers: { authorization: `Bearer ${tokenFor(USER_ID)}` },
      payload: {},
    });
    expect(empty.statusCode).toBe(400);
  });

  it('admin queue is forbidden for regular users and lists open tickets', async () => {
    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/admin/recharge',
      headers: { authorization: `Bearer ${tokenFor(USER_ID)}` },
    });
    expect(forbidden.statusCode).toBe(403);

    await app.inject({
      method: 'POST',
      url: '/api/credits/recharge',
      headers: { authorization: `Bearer ${tokenFor(USER_ID)}` },
      payload: { packId: 'pack_10' },
    });

    const queue = await app.inject({
      method: 'GET',
      url: '/api/admin/recharge',
      headers: { authorization: `Bearer ${tokenFor(ADMIN_ID)}` },
    });
    expect(queue.statusCode).toBe(200);
    const tickets = queue.json().tickets;
    expect(tickets).toHaveLength(1);
    expect(tickets[0].packId).toBe('pack_10');
    expect(tickets[0].username).toBe('buyer');
  });

  it('admin replies in the chat and the user sees the answer', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/credits/recharge',
      headers: { authorization: `Bearer ${tokenFor(USER_ID)}` },
      payload: { packId: 'pack_2' },
    });
    const ticketId = created.json().ticket.id;

    const reply = await app.inject({
      method: 'POST',
      url: `/api/admin/recharge/${ticketId}/message`,
      headers: { authorization: `Bearer ${tokenFor(ADMIN_ID)}` },
      payload: { body: 'Un momento, verificando el pago…' },
    });
    expect(reply.statusCode).toBe(201);
    expect(reply.json().message.senderRole).toBe('admin');

    const my = await app.inject({
      method: 'GET',
      url: '/api/credits/recharge/my',
      headers: { authorization: `Bearer ${tokenFor(USER_ID)}` },
    });
    const roles = my.json().messages.map((m: { senderRole: string }) => m.senderRole);
    expect(roles).toContain('admin');
  });

  it('approve credits the pack via the wallet with audit + system message', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/credits/recharge',
      headers: { authorization: `Bearer ${tokenFor(USER_ID)}` },
      payload: { packId: 'pack_2' },
    });
    const ticketId = created.json().ticket.id;

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/recharge/${ticketId}/approve`,
      headers: { authorization: `Bearer ${tokenFor(ADMIN_ID)}` },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ticket.status).toBe('approved');

    // pack 2€ → 100 créditos, acreditados solo server-side.
    const balance = testDb.select().from(schema.users).where(eq(schema.users.id, USER_ID)).get()!.creditBalance;
    expect(balance).toBe(100);

    const txns = testDb.select().from(schema.creditTransactions).where(eq(schema.creditTransactions.userId, USER_ID)).all();
    expect(txns).toHaveLength(1);
    expect(txns[0].amount).toBe(100);
    expect(txns[0].reason).toBe('purchase:ticket:pack_2');

    const my = await app.inject({
      method: 'GET',
      url: '/api/credits/recharge/my',
      headers: { authorization: `Bearer ${tokenFor(USER_ID)}` },
    });
    const last = my.json().messages.at(-1);
    expect(last.senderRole).toBe('system');
    expect(last.body).toContain('SYSTEM_APPROVED');

    // Re-aprobar/rechazar un ticket resuelto → 409.
    const again = await app.inject({
      method: 'POST',
      url: `/api/admin/recharge/${ticketId}/approve`,
      headers: { authorization: `Bearer ${tokenFor(ADMIN_ID)}` },
      payload: {},
    });
    expect(again.statusCode).toBe(409);
  });

  it('approve credits the correct bonus amount for each pack (275 / 600)', async () => {
    for (const [pack, expected] of [['pack_5', 275], ['pack_10', 875]] as const) {
      const created = await app.inject({
        method: 'POST',
        url: '/api/credits/recharge',
        headers: { authorization: `Bearer ${tokenFor(USER_ID)}` },
        payload: { packId: pack },
      });
      const ticketId = created.json().ticket.id;
      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/recharge/${ticketId}/approve`,
        headers: { authorization: `Bearer ${tokenFor(ADMIN_ID)}` },
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      const balance = testDb.select().from(schema.users).where(eq(schema.users.id, USER_ID)).get()!.creditBalance;
      expect(balance).toBe(expected); // acumulado: 275, luego +600 → 875
    }
  });

  it('reject requires a note and stores it as adminNote + system message', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/credits/recharge',
      headers: { authorization: `Bearer ${tokenFor(USER_ID)}` },
      payload: { packId: 'pack_2' },
    });
    const ticketId = created.json().ticket.id;

    const noNote = await app.inject({
      method: 'POST',
      url: `/api/admin/recharge/${ticketId}/reject`,
      headers: { authorization: `Bearer ${tokenFor(ADMIN_ID)}` },
      payload: {},
    });
    expect(noNote.statusCode).toBe(400);

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/recharge/${ticketId}/reject`,
      headers: { authorization: `Bearer ${tokenFor(ADMIN_ID)}` },
      payload: { note: 'No vemos la transferencia' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ticket.status).toBe('rejected');
    expect(res.json().ticket.adminNote).toBe('No vemos la transferencia');

    // Sin créditos y sin transacción al rechazar.
    const balance = testDb.select().from(schema.users).where(eq(schema.users.id, USER_ID)).get()!.creditBalance;
    expect(balance).toBe(0);
    const txns = testDb.select().from(schema.creditTransactions).where(eq(schema.creditTransactions.userId, USER_ID)).all();
    expect(txns).toHaveLength(0);
  });

  it('rejected ticket allows creating a new one (1 open max, not 1 total)', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/credits/recharge',
      headers: { authorization: `Bearer ${tokenFor(USER_ID)}` },
      payload: { packId: 'pack_2' },
    });
    const ticketId = first.json().ticket.id;
    await app.inject({
      method: 'POST',
      url: `/api/admin/recharge/${ticketId}/reject`,
      headers: { authorization: `Bearer ${tokenFor(ADMIN_ID)}` },
      payload: { note: 'sin pago' },
    });

    const second = await app.inject({
      method: 'POST',
      url: '/api/credits/recharge',
      headers: { authorization: `Bearer ${tokenFor(USER_ID)}` },
      payload: { packId: 'pack_5' },
    });
    expect(second.statusCode).toBe(201);
    expect(second.json().ticket.packId).toBe('pack_5');
  });

  it('user cannot message after their ticket is resolved', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/credits/recharge',
      headers: { authorization: `Bearer ${tokenFor(USER_ID)}` },
      payload: { packId: 'pack_2' },
    });
    const ticketId = first.json().ticket.id;
    await app.inject({
      method: 'POST',
      url: `/api/admin/recharge/${ticketId}/approve`,
      headers: { authorization: `Bearer ${tokenFor(ADMIN_ID)}` },
      payload: {},
    });

    const msg = await app.inject({
      method: 'POST',
      url: '/api/credits/recharge/my/message',
      headers: { authorization: `Bearer ${tokenFor(USER_ID)}` },
      payload: { body: 'gracias!' },
    });
    expect(msg.statusCode).toBe(409);
    expect(msg.json().error).toBe('ticket_closed');
  });
});

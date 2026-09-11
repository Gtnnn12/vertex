import type { FastifyInstance } from 'fastify';
import { eq, desc, and, isNull } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { authenticate, requireAdmin, signJwt } from '../utils/auth.js';
import { STAFF_RANK, STAFF_ROLES, type StaffRole } from '@backspace/shared';
import { generateSnowflake } from '../utils/snowflake.js';

const SUPPORT_CATEGORIES = new Set(['doubt', 'bug', 'report', 'other']);

/**
 * Web-portal routes for the marketing site (vertex-web).
 *
 * The site reuses the same JWT sessions as the app: the web login form posts
 * the user's Vertex credentials to POST /api/web/session, which validates
 * them through the SAME code path as POST /api/auth/login (bcrypt verify +
 * tombstone checks) and mints a standard JWT. No separate OAuth server is
 * needed because the site is first-party and served/shipped alongside the
 * instance — the token is identical in shape and semantics to the app's.
 */

function webOriginAllowed(origin: string | undefined): boolean {
  // Local dev origins for the marketing site. Extend with the production
  // site origin when it is deployed.
  const allowed = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
  ];
  if (!origin) return true; // same-origin / non-browser client
  return allowed.includes(origin);
}

function netrexStatus(row: typeof schema.users.$inferSelect | undefined) {
  if (!row) return { active: false, plan: null, until: null, billingEmail: null };
  const active = row.netrexEnabled === 1 && (row.netrexUntil === null || row.netrexUntil > Date.now());
  return {
    active,
    plan: row.netrexPlan ?? null,
    until: row.netrexUntil ?? null,
    billingEmail: row.billingEmail ?? null,
  };
}

export async function webRoutes(app: FastifyInstance): Promise<void> {
  // ─── POST /api/web/session — "Sign in with Vertex" ─────────────────────────
  // Credentials are validated by the app's own login logic; on success we mint
  // a web-session JWT (same secret/semantics as the app token).
  app.post<{ Body: { username?: unknown; password?: unknown } }>(
    '/api/web/session',
    {
      config: { rateLimit: { max: 15, timeWindow: '2 minutes' } },
    },
    async (request, reply) => {
      if (!webOriginAllowed(request.headers.origin)) {
        return reply.code(403).send({ error: 'Origin not allowed', statusCode: 403 });
      }
      const { username, password } = request.body ?? {};
      if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
        return reply.code(400).send({ error: 'Username and password are required', statusCode: 400 });
      }

      const db = getDb();
      const user = db
        .select()
        .from(schema.users)
        .where(eq(schema.users.username, username.trim().toLowerCase()))
        .get();

      // Reuse the app's credential verification: bcrypt.compare against the
      // stored hash plus the same tombstone / ban checks the app applies.
      if (!user || user.isDeleted === 1) {
        return reply.code(401).send({ error: 'Invalid username or password', statusCode: 401 });
      }
      const { verifyPassword } = await import('../utils/auth.js');
      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        return reply.code(401).send({ error: 'Invalid username or password', statusCode: 401 });
      }
      if (user.bannedUntil && user.bannedUntil > Date.now()) {
        return reply.code(403).send({ error: 'This account is banned', statusCode: 403 });
      }

      // Include the user's staff role in the web-session JWT ('owner' when
      // staffRole=owner, 'admin' for any admin-grade staff, else 'user') so the
      // marketing site can show the Admin entry point without an extra round
      // trip. Authorization itself never trusts this field — requireAdmin
      // re-checks the DB on every /api/web/admin request.
      const staffRank =
        user.staffRole && STAFF_ROLES.includes(user.staffRole as StaffRole)
          ? STAFF_RANK[user.staffRole as StaffRole]
          : undefined;
      const role =
        staffRank !== undefined
          ? staffRank >= STAFF_RANK.owner
            ? 'owner'
            : 'admin'
          : user.isAdmin === 1
            ? 'admin'
            : 'user';

      const token = signJwt({ userId: user.id, username: user.username, role });
      return reply.code(200).send({
        token,
        account: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          email: user.billingEmail,
          createdAt: user.createdAt,
          isAdmin: user.isAdmin === 1,
          staffRole: user.staffRole ?? null,
          netrex: netrexStatus(user),
        },
      });
    },
  );

  // ─── GET /api/web/account — protected profile for /account ────────────────
  app.get('/api/web/account', { preHandler: authenticate }, async (request, reply) => {
    const db = getDb();
    const user = db.select().from(schema.users).where(eq(schema.users.id, request.userId)).get();
    if (!user || user.isDeleted === 1) {
      return reply.code(401).send({ error: 'Account not found', statusCode: 401 });
    }

    const unread = db
      .select({ id: schema.webSupportMessages.id })
      .from(schema.webSupportMessages)
      .where(
        and(
          eq(schema.webSupportMessages.userId, user.id),
          eq(schema.webSupportMessages.status, 'answered'),
          isNull(schema.webSupportMessages.responseSeenAt),
        ),
      )
      .all();

    return reply.code(200).send({
      account: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.billingEmail,          createdAt: user.createdAt,
          isAdmin: user.isAdmin === 1,
          staffRole: user.staffRole ?? null,
          netrex: netrexStatus(user),
        },
        support: {
        unreadResponses: unread.length,
      },
    });
  });

  // ─── Support messages (from /support on the site) ──────────────────────────
  app.post<{ Body: { subject?: unknown; category?: unknown; message?: unknown } }>(
    '/api/web/support',
    { preHandler: authenticate, config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } },
    async (request, reply) => {
      const { subject, category, message } = request.body ?? {};
      if (typeof subject !== 'string' || subject.trim().length === 0 || subject.length > 200) {
        return reply.code(400).send({ error: 'Subject is required (max 200 chars)', statusCode: 400 });
      }
      if (typeof category !== 'string' || !SUPPORT_CATEGORIES.has(category)) {
        return reply.code(400).send({ error: 'Invalid category', statusCode: 400 });
      }
      if (typeof message !== 'string' || message.trim().length === 0 || message.length > 5000) {
        return reply.code(400).send({ error: 'Message is required (max 5000 chars)', statusCode: 400 });
      }

      const db = getDb();
      const user = db
        .select({ id: schema.users.id, username: schema.users.username })
        .from(schema.users)
        .where(eq(schema.users.id, request.userId))
        .get();
      if (!user) {
        return reply.code(401).send({ error: 'Account not found', statusCode: 401 });
      }

      const row = {
        id: generateSnowflake(),
        userId: user.id,
        username: user.username,
        subject: subject.trim(),
        category,
        message: message.trim(),
        status: 'new',
        createdAt: Date.now(),
      };
      db.insert(schema.webSupportMessages).values(row).run();

      return reply.code(201).send({ ok: true, id: row.id });
    },
  );

  // Messages the logged-in user sent (for the badge / own history on /account).
  app.get('/api/web/support/mine', { preHandler: authenticate }, async (request, reply) => {
    const db = getDb();
    const rows = db
      .select()
      .from(schema.webSupportMessages)
      .where(eq(schema.webSupportMessages.userId, request.userId))
      .orderBy(desc(schema.webSupportMessages.createdAt))
      .limit(50)
      .all();

    return reply.code(200).send({
      messages: rows.map((r) => ({
        id: r.id,
        subject: r.subject,
        category: r.category,
        message: r.message,
        status: r.status,
        response: r.response,
        respondedAt: r.respondedAt,
        responseSeenAt: r.responseSeenAt,
        createdAt: r.createdAt,
      })),
    });
  });

  // User marks an answered message as seen (clears the badge).
  app.post<{ Params: { id: string } }>(
    '/api/web/support/mine/:id/seen',
    { preHandler: authenticate },
    async (request, reply) => {
      const db = getDb();
      const result = db
        .update(schema.webSupportMessages)
        .set({ responseSeenAt: Date.now() })
        .where(
          and(
            eq(schema.webSupportMessages.id, request.params.id),
            eq(schema.webSupportMessages.userId, request.userId),
          ),
        )
        .run();
      if (result.changes === 0) {
        return reply.code(404).send({ error: 'Message not found', statusCode: 404 });
      }
      return reply.code(200).send({ ok: true });
    },
  );

  // ─── Admin tray (only instance admins — same gate as the app's /admin) ─────
  app.get('/api/web/admin/support', { preHandler: [authenticate, requireAdmin] }, async (_request, reply) => {
    const db = getDb();
    const rows = db
      .select()
      .from(schema.webSupportMessages)
      .orderBy(desc(schema.webSupportMessages.createdAt))
      .limit(200)
      .all();

    return reply.code(200).send({
      messages: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        username: r.username,
        subject: r.subject,
        category: r.category,
        message: r.message,
        status: r.status,
        response: r.response,
        respondedAt: r.respondedAt,
        createdAt: r.createdAt,
      })),
    });
  });

  app.post<{ Params: { id: string }; Body: { response?: unknown } }>(
    '/api/web/admin/support/:id/respond',
    { preHandler: [authenticate, requireAdmin], config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { response } = request.body ?? {};
      if (typeof response !== 'string' || response.trim().length === 0 || response.length > 5000) {
        return reply.code(400).send({ error: 'Response is required (max 5000 chars)', statusCode: 400 });
      }

      const db = getDb();
      const result = db
        .update(schema.webSupportMessages)
        .set({
          status: 'answered',
          response: response.trim(),
          respondedAt: Date.now(),
          respondedBy: request.userId,
          // Reset the seen flag so the user gets a fresh badge.
          responseSeenAt: null,
        })
        .where(eq(schema.webSupportMessages.id, request.params.id))
        .run();

      if (result.changes === 0) {
        return reply.code(404).send({ error: 'Message not found', statusCode: 404 });
      }
      return reply.code(200).send({ ok: true });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/web/admin/support/:id/status',
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const body = request.body as { status?: unknown } | undefined;
      const status = body?.status;
      if (status !== 'new' && status !== 'answered') {
        return reply.code(400).send({ error: 'status must be "new" or "answered"', statusCode: 400 });
      }
      const db = getDb();
      const result = db
        .update(schema.webSupportMessages)
        .set({ status })
        .where(eq(schema.webSupportMessages.id, request.params.id))
        .run();
      if (result.changes === 0) {
        return reply.code(404).send({ error: 'Message not found', statusCode: 404 });
      }
      return reply.code(200).send({ ok: true });
    },
  );
}

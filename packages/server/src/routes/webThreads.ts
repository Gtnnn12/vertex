import type { FastifyInstance } from 'fastify';
import { eq, desc, and, gt, sql } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { authenticate, requireAdmin } from '../utils/auth.js';
import { generateSnowflake } from '../utils/snowflake.js';

const SUPPORT_CATEGORIES = new Set(['doubt', 'bug', 'report', 'other']);
const MAX_BODY = 5000;

/**
 * Support conversation threads for the marketing site.
 *
 * A thread is one topic: the user's first message creates it, and every
 * later exchange (either side) is a message inside the same thread. Both
 * sides track their own read timestamp (user_read_at / admin_read_at) so
 * unread counts are cheap and each side's badge clears independently.
 */

type ThreadRow = typeof schema.webSupportThreads.$inferSelect;
type MessageRow = typeof schema.webSupportThreadMessages.$inferSelect;

function serializeMessage(r: MessageRow) {
  return {
    id: r.id,
    author: r.author as 'user' | 'admin',
    authorName: r.authorName,
    body: r.body,
    createdAt: r.createdAt,
  };
}

function serializeThreadSummary(t: ThreadRow, lastMessage: MessageRow | undefined, unread: number) {
  return {
    id: t.id,
    username: t.username,
    subject: t.subject,
    category: t.category,
    status: t.status,
    unread,
    lastMessage: lastMessage ? serializeMessage(lastMessage) : null,
    lastMessageAt: t.lastMessageAt,
    createdAt: t.createdAt,
  };
}

function getUserThreads(db: ReturnType<typeof getDb>, userId: string, sinceId?: string) {
  const threads = db
    .select()
    .from(schema.webSupportThreads)
    .where(eq(schema.webSupportThreads.userId, userId))
    .orderBy(desc(schema.webSupportThreads.lastMessageAt))
    .limit(50)
    .all();

  return threads.map((t) => {
    const last = db
      .select()
      .from(schema.webSupportThreadMessages)
      .where(eq(schema.webSupportThreadMessages.threadId, t.id))
      .orderBy(desc(schema.webSupportThreadMessages.createdAt))
      .limit(1)
      .get();
    const since = sinceId
      ? db
          .select({ c: sql<number>`count(*)` })
          .from(schema.webSupportThreadMessages)
          .where(
            and(
              eq(schema.webSupportThreadMessages.threadId, t.id),
              eq(schema.webSupportThreadMessages.author, 'admin'),
              gt(schema.webSupportThreadMessages.id, sinceId),
            ),
          )
          .get()?.c ?? 0
      : db
          .select({ c: sql<number>`count(*)` })
          .from(schema.webSupportThreadMessages)
          .where(
            and(
              eq(schema.webSupportThreadMessages.threadId, t.id),
              eq(schema.webSupportThreadMessages.author, 'admin'),
              gt(schema.webSupportThreadMessages.createdAt, t.userReadAt ?? 0),
            ),
          )
          .get()?.c ?? 0;
    return serializeThreadSummary(t, last, Number(since));
  });
}

export async function webThreadRoutes(app: FastifyInstance): Promise<void> {
  // ─── User side ──────────────────────────────────────────────────────────────

  // List the caller's threads (summaries + last message + unread count).
  app.get('/api/web/support/threads', { preHandler: authenticate }, async (request, reply) => {
    const db = getDb();
    const threads = getUserThreads(db, request.userId);
    const unreadTotal = threads.reduce((n, t) => n + t.unread, 0);
    return reply.code(200).send({ threads, unreadTotal });
  });

  // Full conversation for one thread (ownership enforced).
  app.get<{ Params: { id: string } }>(
    '/api/web/support/threads/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const db = getDb();
      const thread = db
        .select()
        .from(schema.webSupportThreads)
        .where(
          and(eq(schema.webSupportThreads.id, request.params.id), eq(schema.webSupportThreads.userId, request.userId)),
        )
        .get();
      if (!thread) {
        return reply.code(404).send({ error: 'Thread not found', statusCode: 404 });
      }
      const messages = db
        .select()
        .from(schema.webSupportThreadMessages)
        .where(eq(schema.webSupportThreadMessages.threadId, thread.id))
        .orderBy(schema.webSupportThreadMessages.createdAt)
        .limit(500)
        .all();

      // Opening the conversation marks it read for the user side.
      db.update(schema.webSupportThreads)
        .set({ userReadAt: Date.now() })
        .where(eq(schema.webSupportThreads.id, thread.id))
        .run();

      return reply.code(200).send({
        thread: { id: thread.id, subject: thread.subject, category: thread.category, status: thread.status },
        messages: messages.map(serializeMessage),
      });
    },
  );

  // Create a new thread (the "Nuevo tema" path or the very first message).
  app.post<{ Body: { subject?: unknown; category?: unknown; message?: unknown } }>(
    '/api/web/support/threads',
    { preHandler: authenticate, config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } },
    async (request, reply) => {
      const { subject, category, message } = request.body ?? {};
      if (typeof subject !== 'string' || subject.trim().length === 0 || subject.length > 200) {
        return reply.code(400).send({ error: 'Subject is required (max 200 chars)', statusCode: 400 });
      }
      if (typeof category !== 'string' || !SUPPORT_CATEGORIES.has(category)) {
        return reply.code(400).send({ error: 'Invalid category', statusCode: 400 });
      }
      if (typeof message !== 'string' || message.trim().length === 0 || message.length > MAX_BODY) {
        return reply.code(400).send({ error: `Message is required (max ${MAX_BODY} chars)`, statusCode: 400 });
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

      const now = Date.now();
      const thread = {
        id: generateSnowflake(),
        userId: user.id,
        username: user.username,
        subject: subject.trim(),
        category,
        status: 'open',
        userReadAt: now,
        adminReadAt: null,
        lastMessageAt: now,
        createdAt: now,
      };
      db.insert(schema.webSupportThreads).values(thread).run();
      const msg = {
        id: generateSnowflake(),
        threadId: thread.id,
        author: 'user',
        authorName: user.username,
        authorUserId: user.id,
        body: message.trim(),
        createdAt: now,
      };
      db.insert(schema.webSupportThreadMessages).values(msg).run();

      return reply.code(201).send({ ok: true, id: thread.id });
    },
  );

  // User replies inside an existing thread.
  app.post<{ Params: { id: string }; Body: { message?: unknown } }>(
    '/api/web/support/threads/:id/reply',
    { preHandler: authenticate, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { message } = request.body ?? {};
      if (typeof message !== 'string' || message.trim().length === 0 || message.length > MAX_BODY) {
        return reply.code(400).send({ error: `Message is required (max ${MAX_BODY} chars)`, statusCode: 400 });
      }
      const db = getDb();
      const thread = db
        .select()
        .from(schema.webSupportThreads)
        .where(
          and(eq(schema.webSupportThreads.id, request.params.id), eq(schema.webSupportThreads.userId, request.userId)),
        )
        .get();
      if (!thread) {
        return reply.code(404).send({ error: 'Thread not found', statusCode: 404 });
      }

      const now = Date.now();
      const msg = {
        id: generateSnowflake(),
        threadId: thread.id,
        author: 'user',
        authorName: thread.username,
        authorUserId: request.userId,
        body: message.trim(),
        createdAt: now,
      };
      db.transaction((tx) => {
        tx.insert(schema.webSupportThreadMessages).values(msg).run();
        tx.update(schema.webSupportThreads)
          .set({ lastMessageAt: now, userReadAt: now, status: thread.status })
          .where(eq(schema.webSupportThreads.id, thread.id))
          .run();
      });

      return reply.code(201).send({ ok: true, message: serializeMessage(msg) });
    },
  );

  // Unread total for the popup/badge (cheap count, no thread rows shipped).
  app.get('/api/web/support/unread', { preHandler: authenticate }, async (request, reply) => {
    const db = getDb();
    const rows = db
      .select({ userReadAt: schema.webSupportThreads.userReadAt })
      .from(schema.webSupportThreads)
      .where(eq(schema.webSupportThreads.userId, request.userId))
      .all();
    let unreadTotal = 0;
    for (const t of rows) {
      const c =
        db
          .select({ c: sql<number>`count(*)` })
          .from(schema.webSupportThreadMessages)
          .where(
            and(
              eq(schema.webSupportThreadMessages.author, 'admin'),
              gt(schema.webSupportThreadMessages.createdAt, t.userReadAt ?? 0),
              sql`${schema.webSupportThreadMessages.threadId} IN (SELECT id FROM web_support_threads WHERE user_id = ${request.userId} AND user_read_at = ${t.userReadAt})`,
            ),
          )
          .get()?.c ?? 0;
      unreadTotal += Number(c);
    }
    return reply.code(200).send({ unreadTotal });
  });

  // Mark all of the caller's threads read (popup "Ver conversación" fallback).
  app.post('/api/web/support/seen-all', { preHandler: authenticate }, async (request, reply) => {
    const db = getDb();
    db.update(schema.webSupportThreads)
      .set({ userReadAt: Date.now() })
      .where(eq(schema.webSupportThreads.userId, request.userId))
      .run();
    return reply.code(200).send({ ok: true });
  });

  // ─── Admin side ─────────────────────────────────────────────────────────────

  // Inbox: thread summaries ordered by latest activity, with unread counts.
  app.get('/api/web/admin/support/threads', { preHandler: [authenticate, requireAdmin] }, async (_request, reply) => {
    const db = getDb();
    const threads = db
      .select()
      .from(schema.webSupportThreads)
      .orderBy(desc(schema.webSupportThreads.lastMessageAt))
      .limit(200)
      .all();

    const out = threads.map((t) => {
      const last = db
        .select()
        .from(schema.webSupportThreadMessages)
        .where(eq(schema.webSupportThreadMessages.threadId, t.id))
        .orderBy(desc(schema.webSupportThreadMessages.createdAt))
        .limit(1)
        .get();
      const unread =
        db
          .select({ c: sql<number>`count(*)` })
          .from(schema.webSupportThreadMessages)
          .where(
            and(
              eq(schema.webSupportThreadMessages.threadId, t.id),
              eq(schema.webSupportThreadMessages.author, 'user'),
              gt(schema.webSupportThreadMessages.createdAt, t.adminReadAt ?? 0),
            ),
          )
          .get()?.c ?? 0;
      return serializeThreadSummary(t, last, Number(unread));
    });

    return reply.code(200).send({ threads: out });
  });

  // Open a thread: full conversation + mark read for the admin side.
  app.get<{ Params: { id: string } }>(
    '/api/web/admin/support/threads/:id',
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const db = getDb();
      const thread = db
        .select()
        .from(schema.webSupportThreads)
        .where(eq(schema.webSupportThreads.id, request.params.id))
        .get();
      if (!thread) {
        return reply.code(404).send({ error: 'Thread not found', statusCode: 404 });
      }
      const messages = db
        .select()
        .from(schema.webSupportThreadMessages)
        .where(eq(schema.webSupportThreadMessages.threadId, thread.id))
        .orderBy(schema.webSupportThreadMessages.createdAt)
        .limit(500)
        .all();

      db.update(schema.webSupportThreads)
        .set({ adminReadAt: Date.now() })
        .where(eq(schema.webSupportThreads.id, thread.id))
        .run();

      return reply.code(200).send({
        thread: {
          id: thread.id,
          username: thread.username,
          subject: thread.subject,
          category: thread.category,
          status: thread.status,
        },
        messages: messages.map(serializeMessage),
      });
    },
  );

  // Admin reply inside a thread (inline answer; becomes a thread message).
  app.post<{ Params: { id: string }; Body: { message?: unknown } }>(
    '/api/web/admin/support/threads/:id/reply',
    { preHandler: [authenticate, requireAdmin], config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { message } = request.body ?? {};
      if (typeof message !== 'string' || message.trim().length === 0 || message.length > MAX_BODY) {
        return reply.code(400).send({ error: `Message is required (max ${MAX_BODY} chars)`, statusCode: 400 });
      }
      const db = getDb();
      const thread = db
        .select()
        .from(schema.webSupportThreads)
        .where(eq(schema.webSupportThreads.id, request.params.id))
        .get();
      if (!thread) {
        return reply.code(404).send({ error: 'Thread not found', statusCode: 404 });
      }

      const admin = db
        .select({ username: schema.users.username })
        .from(schema.users)
        .where(eq(schema.users.id, request.userId))
        .get();

      const now = Date.now();
      const msg = {
        id: generateSnowflake(),
        threadId: thread.id,
        author: 'admin',
        authorName: admin?.username ?? 'Vertex',
        authorUserId: request.userId,
        body: message.trim(),
        createdAt: now,
      };
      db.transaction((tx) => {
        tx.insert(schema.webSupportThreadMessages).values(msg).run();
        tx.update(schema.webSupportThreads)
          .set({ lastMessageAt: now, adminReadAt: now, status: 'answered' })
          .where(eq(schema.webSupportThreads.id, thread.id))
          .run();
      });

      return reply.code(201).send({ ok: true, message: serializeMessage(msg) });
    },
  );

  app.post<{ Params: { id: string }; Body: { status?: unknown } }>(
    '/api/web/admin/support/threads/:id/status',
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const body = request.body as { status?: unknown } | undefined;
      const status = body?.status;
      if (status !== 'open' && status !== 'closed') {
        return reply.code(400).send({ error: 'status must be "open" or "closed"', statusCode: 400 });
      }
      const db = getDb();
      const result = db
        .update(schema.webSupportThreads)
        .set({ status })
        .where(eq(schema.webSupportThreads.id, request.params.id))
        .run();
      if (result.changes === 0) {
        return reply.code(404).send({ error: 'Thread not found', statusCode: 404 });
      }
      return reply.code(200).send({ ok: true });
    },
  );
}

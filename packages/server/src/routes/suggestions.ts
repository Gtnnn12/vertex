import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { desc, eq } from 'drizzle-orm';
import { authenticate } from '../utils/auth.js';
import { requireStaff } from '../utils/staffAuth.js';
import { getDb, schema } from '../db/index.js';
import type { UserSuggestion } from '@vertex/shared';

const MAX_SUGGESTION_LENGTH = 2000;
const VALID_STATUSES = new Set(['read', 'approved', 'rejected']);

function toSuggestion(row: typeof schema.userSuggestions.$inferSelect): UserSuggestion {
  return {
    id: row.id,
    userId: row.userId ?? '',
    username: row.username,
    text: row.text,
    createdAt: row.createdAt,
    status: (row.status as UserSuggestion['status'] ?? 'pending'),
  };
}

export async function registerSuggestionRoutes(app: FastifyInstance): Promise<void> {
  // Submit a suggestion (any authenticated user).
  app.post('/api/suggestions', { preHandler: authenticate }, async (request, reply) => {
    const body = (request.body ?? {}) as { text?: unknown };
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > MAX_SUGGESTION_LENGTH) {
      return reply.code(400).send({ error: 'invalid_text' });
    }
    const userId = (request as unknown as { userId: string }).userId;
    const username = (request as unknown as { username?: string }).username ?? null;
    const row = {
      id: crypto.randomUUID(),
      userId,
      username,
      text,
      createdAt: Date.now(),
      status: 'pending',
    };
    getDb().insert(schema.userSuggestions).values(row).run();
    return { suggestion: toSuggestion(row as typeof schema.userSuggestions.$inferSelect) };
  });

  // The author's own suggestions.
  app.get('/api/suggestions/mine', { preHandler: authenticate }, async (request) => {
    const userId = (request as unknown as { userId: string }).userId;
    const rows = getDb()
      .select()
      .from(schema.userSuggestions)
      .where(eq(schema.userSuggestions.userId, userId))
      .orderBy(desc(schema.userSuggestions.createdAt))
      .all();
    return { suggestions: rows.map(toSuggestion) };
  });

  // ── Admin triage ──
  // NOTE: authenticate must run first — requireStaff reads request.userId.
  app.get('/api/admin/suggestions', { preHandler: [authenticate, requireStaff] }, async () => {
    const rows = getDb()
      .select()
      .from(schema.userSuggestions)
      .orderBy(desc(schema.userSuggestions.createdAt))
      .all();
    return { suggestions: rows.map(toSuggestion) };
  });

  app.patch('/api/admin/suggestions/:id', { preHandler: [authenticate, requireStaff] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { status?: unknown };
    const status = typeof body.status === 'string' ? body.status : '';
    if (!VALID_STATUSES.has(status)) {
      return reply.code(400).send({ error: 'invalid_status' });
    }
    const updated = getDb()
      .update(schema.userSuggestions)
      .set({ status })
      .where(eq(schema.userSuggestions.id, id))
      .returning()
      .get();
    if (!updated) return reply.code(404).send({ error: 'not_found' });
    return { suggestion: toSuggestion(updated) };
  });
}

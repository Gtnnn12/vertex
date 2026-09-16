import type { FastifyInstance, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { getDb, getRawDb, schema } from '../db/index.js';
import { authenticate } from '../utils/auth.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { hasPermission, isSpaceOwner, PermissionBits } from '../utils/permissions.js';
import { deleteAttachmentByFilename } from '../utils/fileCleanup.js';
import { connectionManager } from '../ws/handler.js';
import {
  assertEmojiLimit,
  getEmojiLimit,
  validateInviteSlug,
  requireEvoLevel,
  getEffectiveLevel,
} from '../utils/evoLimits.js';
import type { SpaceEmoji, CreateSpaceEmojiRequest, SetInviteSlugRequest, SpaceStats } from '@backspace/shared';

/** Emoji name: 2-32 chars, lowercase handle style (letters/digits/_/-). */
const EMOJI_NAME_RE = /^[a-z0-9_-]{2,32}$/;

function evoError(reply: FastifyReply, e: unknown): unknown {
  const ev = e as Error & { statusCode?: number; code?: string; limit?: number };
  if (ev.statusCode === 403 && ev.code) {
    return reply.code(403).send({ error: ev.message, code: ev.code, limit: ev.limit, statusCode: 403 });
  }
  throw e;
}

export async function spaceEvolutionRoutes(app: FastifyInstance): Promise<void> {
  // ─── Custom space emojis (Evolutions level 1+; 10 at N1, 30 at N2) ────────

  // GET /api/spaces/:id/emojis — list. Readable by every member; an empty
  // list at base level is simply "no emojis unlocked".
  app.get<{ Params: { id: string } }>('/api/spaces/:id/emojis', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { id } = request.params;
    const db = getDb();
    const rows = db.select().from(schema.spaceEmojis)
      .where(eq(schema.spaceEmojis.spaceId, id))
      .all();
    const emojis: SpaceEmoji[] = rows.map((r) => ({
      id: r.id,
      spaceId: r.spaceId,
      name: r.name,
      file: r.file,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
    }));
    const space = db.select().from(schema.spaces).where(eq(schema.spaces.id, id)).get();
    return reply.code(200).send({
      emojis,
      limit: space ? getEmojiLimit(space) : 0,
    });
  });

  // POST /api/spaces/:id/emojis — create. MANAGE_GUILD equivalent:
  // MANAGE_SPACE. Name format validated; per-space uniqueness enforced by the
  // DB constraint and checked here first for a clean 409. Count checked in
  // the same write transaction as the insert (race-safe).
  app.post<{ Params: { id: string }; Body: CreateSpaceEmojiRequest }>('/api/spaces/:id/emojis', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { id } = request.params;
    const { name, file } = request.body ?? ({} as CreateSpaceEmojiRequest);
    const db = getDb();

    const space = db.select().from(schema.spaces).where(eq(schema.spaces.id, id)).get();
    if (!space) {
      return reply.code(404).send({ error: 'Space not found', statusCode: 404 });
    }

    if (!hasPermission(request.userId, id, PermissionBits.MANAGE_SPACE)) {
      return reply.code(403).send({ error: 'Missing MANAGE_SPACE permission', statusCode: 403 });
    }

    if (typeof name !== 'string' || !EMOJI_NAME_RE.test(name)) {
      return reply.code(400).send({
        error: 'Emoji name must be 2-32 chars: lowercase letters, digits, _ or -',
        statusCode: 400,
      });
    }
    if (typeof file !== 'string' || file.length === 0 || (file.includes('/') && !file.startsWith('/api/uploads/'))) {
      return reply.code(400).send({ error: 'Invalid emoji file', statusCode: 400 });
    }

    // Benefit gate first (clear evo_required at base level), then limits.
    try {
      requireEvoLevel(space, 'customEmojis');
    } catch (e) {
      return evoError(reply, e);
    }

    const duplicate = db.select({ id: schema.spaceEmojis.id })
      .from(schema.spaceEmojis)
      .where(and(eq(schema.spaceEmojis.spaceId, id), eq(schema.spaceEmojis.name, name)))
      .get();
    if (duplicate) {
      return reply.code(409).send({ error: 'An emoji with this name already exists', statusCode: 409 });
    }

    const emojiId = generateSnowflake();
    const now = Date.now();
    try {
      db.transaction((tx) => {
        assertEmojiLimit(space); // throws evo_emoji_limit when full
        tx.insert(schema.spaceEmojis).values({
          id: emojiId,
          spaceId: id,
          name,
          file,
          createdBy: request.userId,
          createdAt: now,
        }).run();
      });
    } catch (e) {
      return evoError(reply, e);
    }

    const emoji = db.select().from(schema.spaceEmojis).where(eq(schema.spaceEmojis.id, emojiId)).get();
    return reply.code(201).send({
      emoji: emoji ? {
        id: emoji.id, spaceId: emoji.spaceId, name: emoji.name,
        file: emoji.file, createdBy: emoji.createdBy, createdAt: emoji.createdAt,
      } : null,
      limit: getEmojiLimit(space),
    });
  });

  // DELETE /api/spaces/:id/emojis/:emojiId — always allowed (freeing slots).
  app.delete<{ Params: { id: string; emojiId: string } }>('/api/spaces/:id/emojis/:emojiId', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { id, emojiId } = request.params;
    const db = getDb();

    if (!hasPermission(request.userId, id, PermissionBits.MANAGE_SPACE)) {
      return reply.code(403).send({ error: 'Missing MANAGE_SPACE permission', statusCode: 403 });
    }

    const emoji = db.select().from(schema.spaceEmojis)
      .where(and(eq(schema.spaceEmojis.id, emojiId), eq(schema.spaceEmojis.spaceId, id)))
      .get();
    if (!emoji) {
      return reply.code(404).send({ error: 'Emoji not found', statusCode: 404 });
    }

    db.delete(schema.spaceEmojis).where(eq(schema.spaceEmojis.id, emojiId)).run();
    if (emoji.file && !emoji.file.startsWith('http')) {
      deleteAttachmentByFilename(emoji.file);
    }
    return reply.code(200).send({ success: true });
  });

  // ─── Custom invite slug (Evolutions level 1+) ─────────────────────────────

  // PATCH /api/spaces/:id/invite-slug — set or clear (null) the custom slug.
  // Owner-or-MANAGE_SPACE; format + reserved words + uniqueness validated
  // server-side against both slug and random-code namespaces.
  app.patch<{ Params: { id: string }; Body: SetInviteSlugRequest }>('/api/spaces/:id/invite-slug', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { id } = request.params;
    const { slug } = request.body ?? ({} as SetInviteSlugRequest);
    const db = getDb();

    const space = db.select().from(schema.spaces).where(eq(schema.spaces.id, id)).get();
    if (!space) {
      return reply.code(404).send({ error: 'Space not found', statusCode: 404 });
    }

    if (!hasPermission(request.userId, id, PermissionBits.MANAGE_SPACE)) {
      return reply.code(403).send({ error: 'Missing MANAGE_SPACE permission', statusCode: 403 });
    }

    if (slug === null || slug === '') {
      db.update(schema.spaces).set({ customInviteSlug: null }).where(eq(schema.spaces.id, id)).run();
      return reply.code(200).send({ customInviteSlug: null });
    }

    if (typeof slug !== 'string') {
      return reply.code(400).send({ error: 'Invalid slug', statusCode: 400 });
    }

    try {
      requireEvoLevel(space, 'customInviteSlug');
    } catch (e) {
      return evoError(reply, e);
    }

    const invalid = validateInviteSlug(slug);
    if (invalid === 'format') {
      return reply.code(400).send({
        error: 'Slug must be 2-32 chars: lowercase letters, digits and hyphens, starting and ending with a letter or digit',
        code: 'evo_slug_format',
        statusCode: 400,
      });
    }
    if (invalid === 'taken') {
      return reply.code(409).send({
        error: 'This URL is already taken',
        code: 'evo_slug_taken',
        statusCode: 409,
      });
    }

    db.update(schema.spaces).set({ customInviteSlug: slug }).where(eq(schema.spaces.id, id)).run();
    return reply.code(200).send({ customInviteSlug: slug });
  });

  // GET /api/invites/:code — resolve code OR custom slug to a space preview.
  // Public preview shape, same fields as invitePreview.
  app.get<{ Params: { code: string } }>('/api/invites/:code', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { code } = request.params;
    const db = getDb();
    const space = db.select().from(schema.spaces)
      .where(eq(schema.spaces.customInviteSlug, code))
      .get()
      ?? db.select().from(schema.spaces).where(eq(schema.spaces.inviteCode, code)).get();
    if (!space) {
      return reply.code(404).send({ error: 'Invalid invite code', statusCode: 404 });
    }
    const memberCount = db.select().from(schema.spaceMembers)
      .where(eq(schema.spaceMembers.spaceId, space.id)).all().length;
    return reply.code(200).send({
      spaceId: space.id,
      spaceName: space.name,
      description: space.description ?? null,
      icon: space.icon ?? null,
      avatarColor: space.avatarColor ?? null,
      memberCount,
      instanceName: '',
      customSlug: space.customInviteSlug ?? null,
    });
  });

  // ─── Space statistics (Evolutions level 2) ────────────────────────────────

  // GET /api/spaces/:id/stats — gated on the EFFECTIVE level, so a frozen
  // (Netrex-lapsed) N2 space reads 403 evo_required until renewed. Nothing is
  // ever deleted; this only blocks new reads.
  app.get<{ Params: { id: string } }>('/api/spaces/:id/stats', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { id } = request.params;
    const db = getDb();

    const space = db.select().from(schema.spaces).where(eq(schema.spaces.id, id)).get();
    if (!space) {
      return reply.code(404).send({ error: 'Space not found', statusCode: 404 });
    }

    if (!isSpaceOwner(id, request.userId) && !hasPermission(request.userId, id, PermissionBits.MANAGE_SPACE)) {
      return reply.code(403).send({ error: 'Missing MANAGE_SPACE permission', statusCode: 403 });
    }

    try {
      requireEvoLevel(space, 'spaceStats');
    } catch (e) {
      return evoError(reply, e);
    }

    const channels = db.select().from(schema.channels).where(eq(schema.channels.spaceId, id)).all();
    const channelIds = channels.map((c) => c.id);
    const members = db.select().from(schema.spaceMembers).where(eq(schema.spaceMembers.spaceId, id)).all();
    const emojis = db.select().from(schema.spaceEmojis).where(eq(schema.spaceEmojis.spaceId, id)).all();
    const roles = db.select().from(schema.roles).where(eq(schema.roles.spaceId, id)).all();

    let messageCount = 0;
    let activeMembers7d = 0;
    if (channelIds.length > 0) {
      const rawDb = getRawDb();
      const placeholders = channelIds.map(() => '?').join(',');
      messageCount = (rawDb.prepare(
        `SELECT COUNT(*) c FROM messages WHERE channel_id IN (${placeholders})`
      ).get(...channelIds) as { c: number }).c;
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const authorRows = rawDb.prepare(
        `SELECT DISTINCT author_id FROM messages WHERE channel_id IN (${placeholders}) AND created_at > ?`
      ).all(...channelIds, weekAgo) as { author_id: string }[];
      const memberIds = new Set(members.map((m) => m.userId));
      activeMembers7d = authorRows.filter((a) => memberIds.has(a.author_id)).length;
    }

    const stats: SpaceStats = {
      spaceId: id,
      memberCount: members.length,
      messageCount,
      channelCount: channels.filter((c) => c.type === 'text').length,
      voiceChannelCount: channels.filter((c) => c.type === 'voice').length,
      roleCount: roles.length,
      emojiCount: emojis.length,
      activeMembers7d,
      createdAt: space.createdAt,
    };
    return reply.code(200).send(stats);
  });

  // GET /api/spaces/:id/evolution — full evolution state for the settings
  // panel: stored level, effective level, per-benefit availability and the
  // emoji limit. One round-trip for the whole catalog UI.
  app.get<{ Params: { id: string } }>('/api/spaces/:id/evolution', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { id } = request.params;
    const db = getDb();

    const space = db.select().from(schema.spaces).where(eq(schema.spaces.id, id)).get();
    if (!space) {
      return reply.code(404).send({ error: 'Space not found', statusCode: 404 });
    }

    const emojiCount = db.select({ id: schema.spaceEmojis.id })
      .from(schema.spaceEmojis)
      .where(eq(schema.spaceEmojis.spaceId, id))
      .all().length;

    return reply.code(200).send({
      serverEvoLevel: space.serverEvoLevel ?? 0,
      effectiveLevel: getEffectiveLevel(space),
      emojiLimit: getEmojiLimit(space),
      emojiCount,
      benefits: {
        banner: getEffectiveLevel(space) >= 1,
        animatedIcon: getEffectiveLevel(space) >= 1,
        customInviteSlug: getEffectiveLevel(space) >= 1,
        eventChannels: getEffectiveLevel(space) >= 1,
        animatedBanner: getEffectiveLevel(space) >= 2,
        spaceStats: getEffectiveLevel(space) >= 2,
      },
    });
  });
}

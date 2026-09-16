import type { FastifyInstance, FastifyReply } from 'fastify';
import { eq, and, gt, desc } from 'drizzle-orm';
import { getDb, getRawDb, schema } from '../db/index.js';
import { authenticate } from '../utils/auth.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { hasPermission, isSpaceOwner, isMember, PermissionBits } from '../utils/permissions.js';
import { deleteAttachmentByFilename } from '../utils/fileCleanup.js';
import { connectionManager } from '../ws/handler.js';
import {
  assertEmojiLimit,
  getEmojiLimit,
  validateInviteSlug,
  requireEvoLevel,
  getEffectiveLevel,
  getEvoState,
  levelForBoosts,
  ensureBoosterRole,
  getBoosterRoleId,
} from '../utils/evoLimits.js';
import type {
  Space,
  SpaceEmoji,
  CreateSpaceEmojiRequest,
  SetInviteSlugRequest,
  SpaceStats,
  BoostState,
  SpaceBoost,
} from '@backspace/shared';
import { BOOST_DURATION_DAYS } from '@backspace/shared/src/evoConstants.js';

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
  // panel: effective level (computed from active boosts), per-benefit
  // availability and the emoji limit. One round-trip for the whole catalog UI.
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

    const state = getEvoState(space);

    return reply.code(200).send({
      serverEvoLevel: state.effectiveLevel,
      effectiveLevel: state.effectiveLevel,
      activeBoosts: state.activeBoosts,
      emojiLimit: getEmojiLimit(space),
      emojiCount,
      benefits: {
        banner: state.effectiveLevel >= 1,
        animatedIcon: state.effectiveLevel >= 1,
        customInviteSlug: state.effectiveLevel >= 1,
        eventChannels: state.effectiveLevel >= 1,
        animatedBanner: state.effectiveLevel >= 2,
        spaceStats: state.effectiveLevel >= 2,
      },
    });
  });

  // ─── Server Boosts (modelo estilo Nitro server boosts) ───────────────────

  /** GET /api/spaces/:id/boosts — estado de mejoras, visible para TODOS los miembros. */
  app.get<{ Params: { id: string } }>('/api/spaces/:id/boosts', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { id } = request.params;
    const db = getDb();

    const space = db.select().from(schema.spaces).where(eq(schema.spaces.id, id)).get();
    if (!space) {
      return reply.code(404).send({ error: 'Space not found', statusCode: 404 });
    }
    if (!isMember(id, request.userId)) {
      return reply.code(403).send({ error: 'You are not a member of this space', statusCode: 403 });
    }

    const state = getEvoState(space);
    const now = Date.now();

    const mine = db.select()
      .from(schema.spaceBoosts)
      .where(and(
        eq(schema.spaceBoosts.spaceId, id),
        eq(schema.spaceBoosts.userId, request.userId),
        gt(schema.spaceBoosts.expiresAt, now),
      ))
      .all();

    const creditRow = db.select().from(schema.boostCredits)
      .where(eq(schema.boostCredits.userId, request.userId)).get();

    const body: BoostState = {
      activeBoosts: state.activeBoosts,
      serverEvoLevel: levelForBoosts(state.activeBoosts),
      effectiveLevel: state.effectiveLevel,
      boostsForLevel1: 4,
      boostsForLevel2: 10,
      myCredits: creditRow?.credits ?? 0,
      myBoosts: mine.length,
      nextExpiryAt: state.nextExpiryAt,
    };
    return reply.code(200).send(body);
  });

  // GET /api/spaces/:id/boosts/list — mejora activa más reciente de cada
  // miembro (para la tabla "boosters" del panel). Readable by every member.
  app.get<{ Params: { id: string } }>('/api/spaces/:id/boosts/list', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { id } = request.params;
    const db = getDb();

    const space = db.select().from(schema.spaces).where(eq(schema.spaces.id, id)).get();
    if (!space) {
      return reply.code(404).send({ error: 'Space not found', statusCode: 404 });
    }
    if (!isMember(id, request.userId)) {
      return reply.code(403).send({ error: 'You are not a member of this space', statusCode: 403 });
    }

    const rows = db.select()
      .from(schema.spaceBoosts)
      .where(and(eq(schema.spaceBoosts.spaceId, id), gt(schema.spaceBoosts.expiresAt, Date.now())))
      .orderBy(desc(schema.spaceBoosts.createdAt))
      .all();

    const boosts: SpaceBoost[] = rows.map((r) => ({
      id: r.id,
      spaceId: r.spaceId,
      userId: r.userId,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
    }));
    return reply.code(200).send({ boosts });
  });

  // POST /api/spaces/:id/boost — CUALQUIER MIEMBRO del server canjea 1 crédito
  // de mejora (comprado vía billing, 2€/mes por mejora). La compra original va
  // por el webhook de billing → boost_credits; aquí solo se canjea: 1 crédito
  // → 1 fila space_boosts con expires_at = now + 30 días. Idempotente por
  // crédito (el débito y el insert van en la misma transacción).
  app.post<{ Params: { id: string } }>('/api/spaces/:id/boost', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { id } = request.params;
    const db = getDb();

    const space = db.select().from(schema.spaces).where(eq(schema.spaces.id, id)).get();
    if (!space) {
      return reply.code(404).send({ error: 'Space not found', statusCode: 404 });
    }

    // Cualquier MIEMBRO puede mejorar el server — no solo el owner.
    if (!isMember(id, request.userId)) {
      return reply.code(403).send({ error: 'Space membership required to boost', code: 'not_member', statusCode: 403 });
    }

    const now = Date.now();
    const expiresAt = now + BOOST_DURATION_DAYS * 24 * 60 * 60 * 1000;
    let boostId: string | null = null;

    try {
      db.transaction((tx) => {
        // Débito atómico del crédito (INSERT ... ON CONFLICT + RETURNING vía
        // drizzle: upsert then decrement, race-safe dentro de la transacción).
        const existing = tx.select().from(schema.boostCredits)
          .where(eq(schema.boostCredits.userId, request.userId)).get();
        if (!existing || existing.credits < 1) {
          const err = new Error('No boost credits available — purchase "Mejora de server — 2€/mes" first') as Error & {
            statusCode: number;
            code: string;
          };
          err.statusCode = 402;
          err.code = 'no_boost_credits';
          throw err;
        }
        tx.update(schema.boostCredits)
          .set({ credits: existing.credits - 1, updatedAt: now })
          .where(eq(schema.boostCredits.userId, request.userId))
          .run();

        boostId = generateSnowflake();
        tx.insert(schema.spaceBoosts).values({
          id: boostId,
          spaceId: id,
          userId: request.userId,
          createdAt: now,
          expiresAt,
        }).run();
      });
    } catch (e) {
      const ev = e as Error & { statusCode?: number; code?: string };
      if (ev.statusCode === 402 && ev.code) {
        return reply.code(402).send({ error: ev.message, code: ev.code, statusCode: 402 });
      }
      throw e;
    }

    // Rol "Server Booster" idempotente en este server, asignado al comprador.
    ensureBoosterRole(id, request.userId, now);

    const after = getEvoState(space);
    const previousLevel = levelForBoosts(Math.max(after.activeBoosts - 1, 0));
    const updatedSpace = db.select().from(schema.spaces).where(eq(schema.spaces.id, id)).get();
    if (updatedSpace) {
      // serverEvoLevel is now derived (not stored); ship the computed value
      // via rowToSpace-equivalent shape so older clients stay in sync.
      connectionManager.sendToSpace(id, {
        type: 'space_updated',
        space: {
          id: updatedSpace.id,
          name: updatedSpace.name,
          icon: updatedSpace.icon,
          banner: updatedSpace.banner ?? null,
          avatarColor: (updatedSpace.avatarColor as Space['avatarColor']) ?? null,
          ownerId: updatedSpace.ownerId,
          inviteCode: updatedSpace.inviteCode,
          visibility: (updatedSpace.visibility ?? 'private') as Space['visibility'],
          description: updatedSpace.description ?? null,
          serverEvoLevel: after.effectiveLevel,
          customInviteSlug: updatedSpace.customInviteSlug ?? null,
          bannerContentType: updatedSpace.bannerContentType ?? null,
          createdAt: updatedSpace.createdAt,
        },
      });
    }

    const createdBoost: SpaceBoost = {
      id: boostId!,
      spaceId: id,
      userId: request.userId,
      createdAt: now,
      expiresAt,
    };
    return reply.code(201).send({
      boost: createdBoost,
      activeBoosts: after.activeBoosts,
      serverEvoLevel: after.effectiveLevel,
      previousLevel,
    });
  });
}

import { eq, and, gt, inArray } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import {
  EVO_CHANNEL_LIMITS as SHARED_EVO_LIMITS,
  EVO_ROLE_COLOR_LIMITS,
  EVO_EMOJI_LIMITS,
  MAX_EVO_LEVEL,
  EVO_REQUIREMENTS,
  CUSTOM_INVITE_SLUG_RE,
  CUSTOM_INVITE_SLUG_MAX,
  BOOSTER_ROLE_DEFAULT_NAME,
  BOOSTER_ROLE_COLOR,
} from '@backspace/shared/src/evoConstants.js';
import { DEFAULT_EVERYONE_PERMISSIONS, permissionsToString } from '@backspace/shared/src/permissions.js';

/**
 * Server Evolutions ("boosts", our own flavor):
 *
 * - Channel limits per level: base (free) 10 text + 5 voice; level 1: 20 text
 *   + 15 voice; level 2: 35 text + 25 voice.
 * - MODELO BOOSTS: the level is NOT stored on the spaces row anymore. It is
 *   computed server-side by counting non-expired rows in space_boosts:
 *   4+ active boosts → Level 1, 10+ → Level 2. Any member can purchase a
 *   boost (2€/mes vía billing) — money goes to the platform, like Discord.
 * - FREEZE RULE: expired boosts keep their rows (nothing is deleted or
 *   downgraded anywhere); the level simply counts fewer active boosts, so
 *   enforcement clamps to the base limits until the community re-boosts.
 */

export const BASE_TEXT_CHANNEL_LIMIT = SHARED_EVO_LIMITS[0].text;
export const BASE_VOICE_CHANNEL_LIMIT = SHARED_EVO_LIMITS[0].voice;

/** Level → channel limits. Level 0 (base) is free for everyone. */
export const EVO_CHANNEL_LIMITS: Readonly<Record<number, { text: number; voice: number }>> = SHARED_EVO_LIMITS;

export { MAX_EVO_LEVEL };

/**
 * Real Netrex entitlement for a user row — same fallback chain as
 * routes/users.ts computeNetrexEntitlement and routes/netrex.ts GET
 * /entitlement: purchased plan wins, legacy admin-grant expiry backs it up.
 * Duplicated here (like ai/vertexAI.ts) to avoid a cross-route import cycle.
 */
export function computeNetrexEntitlement(row: typeof schema.users.$inferSelect): boolean {
  const until = row.netrexUntil ?? row.netrexExpiresAt ?? null;
  const granted = row.netrexEnabled === 1 && (until === null || until > Date.now());
  const purchased = row.netrexUntil != null && row.netrexUntil > Date.now();
  return granted || purchased;
}

export interface EvoState {
  /** Number of non-expired boosts (= the server's level source of truth). */
  activeBoosts: number;
  /** Level actually enforceable right now: min(activeBoosts mapped, MAX). */
  effectiveLevel: number;
  limits: { text: number; voice: number };
  /** Epoch ms of the soonest-expiring active boost (null when none). */
  nextExpiryAt: number | null;
}

/** Map active-boost count → level: 0-3 base, 4-9 N1, 10+ N2. */
export function levelForBoosts(activeBoosts: number): number {
  if (activeBoosts >= 10) return 2;
  if (activeBoosts >= 4) return 1;
  return 0;
}

/**
 * Count non-expired boosts for a space and derive the level. The count IS the
 * level source of truth — nothing is stored, so an expiry automatically
 * de-factors from the count without any scheduled job (freeze rule: the rows
 * survive, only the count changes).
 */
export function getEvoState(space: Pick<typeof schema.spaces.$inferSelect, 'id'>): EvoState {
  const db = getDb();
  const now = Date.now();
  const rows = db
    .select({ id: schema.spaceBoosts.id, expiresAt: schema.spaceBoosts.expiresAt })
    .from(schema.spaceBoosts)
    .where(and(eq(schema.spaceBoosts.spaceId, space.id), gt(schema.spaceBoosts.expiresAt, now)))
    .all();
  const activeBoosts = rows.length;
  const effectiveLevel = levelForBoosts(activeBoosts);
  const limits = EVO_CHANNEL_LIMITS[Math.min(Math.max(effectiveLevel, 0), MAX_EVO_LEVEL) as 0 | 1 | 2]
    ?? EVO_CHANNEL_LIMITS[0]!;
  const nextExpiryAt = rows.length > 0
    ? rows.reduce((min, r) => Math.min(min, r.expiresAt), Number.POSITIVE_INFINITY)
    : null;
  return {
    activeBoosts,
    effectiveLevel,
    limits,
    nextExpiryAt: nextExpiryAt === Number.POSITIVE_INFINITY ? null : nextExpiryAt,
  };
}

/**
 * Count REAL channels in the DB per type for a space and reject (throwing an
 * Error carrying an i18n code + http status) when creating one more would
 * exceed the effective level's limit. Call inside a write transaction right
 * before inserting the new channel.
 */
export function assertChannelLimit(
  space: typeof schema.spaces.$inferSelect,
  type: string,
): void {
  if (type !== 'text' && type !== 'voice') return;
  const db = getDb();
  const state = getEvoState(space);
  const kind = type === 'text' ? 'text' : 'voice';
  const limit = state.limits[kind];
  const current = db
    .select({ id: schema.channels.id })
    .from(schema.channels)
    .where(
      and(eq(schema.channels.spaceId, space.id), inArray(schema.channels.type, [kind])),
    )
    .all().length;
  if (current >= limit) {
    const err = new Error(
      state.effectiveLevel > 0
        ? `Channel limit reached for level ${state.effectiveLevel} (${limit} ${kind})`
        : `Channel limit reached (base plan: ${limit} ${kind})`,
    ) as Error & { statusCode: number; code: string; limit: number };
    err.statusCode = 403;
    err.code = state.effectiveLevel > 0 ? 'evo_limit_reached' : 'evo_limit_base_upgrade';
    err.limit = limit;
    throw err;
  }
}

/**
 * Generic benefit gate: the minimum evolution level required for a benefit
 * (from EVO_REQUIREMENTS), checked against the space's EFFECTIVE level —
 * so a frozen (Netrex-lapsed) level-2 space loses gated benefits at write
 * time exactly like the channel limits, without anything being deleted.
 */
export function getEffectiveLevel(space: typeof schema.spaces.$inferSelect): number {
  return getEvoState(space).effectiveLevel;
}

export function requireEvoLevel(
  space: typeof schema.spaces.$inferSelect,
  benefit: keyof typeof EVO_REQUIREMENTS,
): void {
  const required = EVO_REQUIREMENTS[benefit];
  if (getEffectiveLevel(space) < required) {
    const err = new Error(`Benefit '${benefit}' requires evolution level ${required}`) as Error & {
      statusCode: number;
      code: string;
    };
    err.statusCode = 403;
    err.code = 'evo_required';
    throw err;
  }
}

/**
 * Deterministic role id for a space's Server Booster role: '<spaceId>:booster'.
 * Idempotency for the role + its assignment is keyed on this shape, so a
 * member buying 5 boosts still ends with exactly one role and one assignment.
 */
export function getBoosterRoleId(spaceId: string): string {
  return `${spaceId}:booster`;
}

/**
 * Ensure the space's "Server Booster" role exists (idempotent) and is
 * assigned to `userId` (idempotent). CERO permisos extra — the role carries
 * the @everyone baseline only; the owner may rename it or recolor it later
 * via the normal role endpoints. Visible in the member list and popout.
 */
export function ensureBoosterRole(spaceId: string, userId: string, now: number): void {
  const db = getDb();
  const roleId = getBoosterRoleId(spaceId);
  const existing = db.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.id, roleId)).get();
  if (!existing) {
    db.insert(schema.roles).values({
      id: roleId,
      spaceId,
      name: BOOSTER_ROLE_DEFAULT_NAME,
      color: BOOSTER_ROLE_COLOR,
      position: 0,
      permissions: permissionsToString(DEFAULT_EVERYONE_PERMISSIONS),
      createdAt: now,
    }).run();
  }
  const assigned = db
    .select({ roleId: schema.memberRoles.roleId })
    .from(schema.memberRoles)
    .where(and(
      eq(schema.memberRoles.spaceId, spaceId),
      eq(schema.memberRoles.userId, userId),
      eq(schema.memberRoles.roleId, roleId),
    ))
    .get();
  if (!assigned) {
    db.insert(schema.memberRoles).values({ spaceId, userId, roleId }).run();
  }
}

/**
 * Role-color gate: base allows 1 custom color (the default grey doesn't
 * count), level 1 allows 5, level 2 unlimited. Count roles whose color
 * differs from the default.
 */
export const DEFAULT_ROLE_COLOR = '#b9bbbe';

export function assertRoleColorLimit(space: typeof schema.spaces.$inferSelect): void {
  const level = getEffectiveLevel(space);
  const limit = EVO_ROLE_COLOR_LIMITS[Math.min(Math.max(level, 0), MAX_EVO_LEVEL) as 0 | 1 | 2];
  if (limit === null) return; // unlimited
  const db = getDb();
  const customColors = db
    .select({ id: schema.roles.id, color: schema.roles.color })
    .from(schema.roles)
    .where(eq(schema.roles.spaceId, space.id))
    .all()
    .filter((r) => (r.color ?? DEFAULT_ROLE_COLOR).toLowerCase() !== DEFAULT_ROLE_COLOR)
    // The Server Booster role is a fixed cosmetics perk of the boosts model:
    // it never consumes a level's custom-color slot.
    .filter((r) => r.id !== getBoosterRoleId(space.id)).length;
  if (customColors >= limit) {
    const err = new Error(`Custom role color limit reached (${limit} at level ${level})`) as Error & {
      statusCode: number;
      code: string;
      limit: number;
    };
    err.statusCode = 403;
    err.code = 'evo_role_color_limit';
    err.limit = limit;
    throw err;
  }
}

/** Emoji limits per level (0 at base). */
export function getEmojiLimit(space: typeof schema.spaces.$inferSelect): number {
  const level = getEffectiveLevel(space);
  return EVO_EMOJI_LIMITS[Math.min(Math.max(level, 0), MAX_EVO_LEVEL) as 0 | 1 | 2];
}

export function assertEmojiLimit(space: typeof schema.spaces.$inferSelect): void {
  const limit = getEmojiLimit(space);
  const current = getDb()
    .select({ id: schema.spaceEmojis.id })
    .from(schema.spaceEmojis)
    .where(eq(schema.spaceEmojis.spaceId, space.id))
    .all().length;
  if (current >= limit) {
    const err = new Error(`Custom emoji limit reached (${limit} at this level)`) as Error & {
      statusCode: number;
      code: string;
      limit: number;
    };
    err.statusCode = 403;
    err.code = 'evo_emoji_limit';
    err.limit = limit;
    throw err;
  }
}

/**
 * Validate a custom invite slug: format, reserved words and length. Uniqueness
 * is checked against spaces.custom_invite_slug AND spaces.inviteCode (a slug
 * must never collide with an existing join path). Returns null when valid,
 * otherwise a short reason code.
 */
export function validateInviteSlug(slug: string): 'format' | 'taken' | null {
  if (slug.length < 2 || slug.length > CUSTOM_INVITE_SLUG_MAX) return 'format';
  if (!CUSTOM_INVITE_SLUG_RE.test(slug)) return 'format';
  const reserved = new Set(['join', 'api', 'admin', 'spaces', 'explore', 'login', 'register', 'invite', 'invites', 'channels', 'users', 'uploads', 'static', 'ws']);
  if (reserved.has(slug)) return 'taken';
  const db = getDb();
  const clashSlug = db.select({ id: schema.spaces.id }).from(schema.spaces).where(eq(schema.spaces.customInviteSlug, slug)).get();
  if (clashSlug) return 'taken';
  const clashCode = db.select({ id: schema.spaces.id }).from(schema.spaces).where(eq(schema.spaces.inviteCode, slug)).get();
  if (clashCode) return 'taken';
  return null;
}

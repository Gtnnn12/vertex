import { eq, and, inArray } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { EVO_CHANNEL_LIMITS as SHARED_EVO_LIMITS, MAX_EVO_LEVEL } from '@backspace/shared/src/evoConstants.js';

/**
 * Server Evolutions ("boosts", our own flavor):
 *
 * - Channel limits per level: base (free) 10 text + 5 voice; level 1: 20 text
 *   + 15 voice; level 2: 35 text + 25 voice.
 * - Evolving requires the space OWNER's real Netrex entitlement, validated
 *   server-side via the same chain as the music-widget gate / profile board.
 * - The level is stored on the spaces row (server_evo_level, migration 0017).
 * - When the owner's Netrex lapses NOTHING is deleted or downgraded: the
 *   level freezes, and only creation above the base limit is blocked until
 *   it is renewed. Channel creation enforces this at write time by clamping
 *   the effective level to base when the current owner lost entitlement.
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
  /** Level stored on the row (frozen when Netrex lapses — never downgraded). */
  storedLevel: number;
  /** Level actually enforceable right now: stored, clamped to base if the current owner lacks entitlement. */
  effectiveLevel: number;
  limits: { text: number; voice: number };
  /** Owner currently has Netrex. */
  ownerEntitled: boolean;
}

/**
 * Compute the evolution state of a space. The stored level survives a Netrex
 * lapse (freeze rule), but the effective level — the one used to authorize
 * creating MORE channels — clamps down to base until the owner renews.
 */
export function getEvoState(space: typeof schema.spaces.$inferSelect): EvoState {
  const db = getDb();
  const owner = db.select().from(schema.users).where(eq(schema.users.id, space.ownerId)).get();
  const ownerEntitled = owner ? computeNetrexEntitlement(owner) : false;
  const storedLevel = Math.min(Math.max(space.serverEvoLevel ?? 0, 0), MAX_EVO_LEVEL);
  const effectiveLevel = ownerEntitled ? storedLevel : 0;
  const limits = EVO_CHANNEL_LIMITS[effectiveLevel] ?? EVO_CHANNEL_LIMITS[0]!;
  return {
    storedLevel,
    effectiveLevel,
    limits,
    ownerEntitled,
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
      state.ownerEntitled
        ? `Channel limit reached for level ${state.effectiveLevel} (${limit} ${kind})`
        : `Channel limit reached (base plan: ${limit} ${kind})`,
    ) as Error & { statusCode: number; code: string; limit: number };
    err.statusCode = 403;
    err.code = state.ownerEntitled ? 'evo_limit_reached' : 'evo_limit_base_upgrade';
    err.limit = limit;
    throw err;
  }
}

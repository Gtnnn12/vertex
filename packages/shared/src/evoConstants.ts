/**
 * Server Evolutions constants shared between the server (enforcement) and the
 * web client (display). The server keeps its own enriched helpers in
 * packages/server/src/utils/evoLimits.ts — these are the pure numbers plus
 * the benefit catalog the Evolutions panel renders.
 */

export const EVO_CHANNEL_LIMITS: Readonly<Record<0 | 1 | 2, { text: number; voice: number }>> = {
  0: { text: 10, voice: 5 },
  1: { text: 20, voice: 15 },
  2: { text: 35, voice: 25 },
};

/** Custom (non-default) role colors allowed per level. Level 2 = unlimited. */
export const EVO_ROLE_COLOR_LIMITS: Readonly<Record<0 | 1 | 2, number | null>> = {
  0: 1,
  1: 5,
  2: null, // unlimited
};

/** Custom space emojis allowed per level. */
export const EVO_EMOJI_LIMITS: Readonly<Record<0 | 1 | 2, number>> = {
  0: 0,
  1: 10,
  2: 30,
};

export const MAX_EVO_LEVEL = 2;

/** Minimum level required by each gated benefit. */
export const EVO_REQUIREMENTS = {
  banner: 1,
  animatedIcon: 1,
  animatedBanner: 2,
  customInviteSlug: 1,
  eventChannels: 1,
  spaceStats: 2,
  customEmojis: 1,
} as const;

/** Slug format for custom invite URLs (e.g. /join/my-server). */
export const CUSTOM_INVITE_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;
export const CUSTOM_INVITE_SLUG_MAX = 32;

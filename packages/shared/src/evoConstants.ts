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

// ─── Server Boosts (modelo estilo Nitro server boosts) ──────────────────────

/** Cada mejora cuesta 2€/mes y dura 30 días. */
export const BOOST_PRICE_LABEL = '2€';
export const BOOST_DURATION_DAYS = 30;

/** Umbral de boosts activos por nivel: 0→base, 4→Nivel 1, 10→Nivel 2. */
export const BOOST_THRESHOLDS: readonly [4, 10] = [4, 10];
export const BOOSTS_FOR_LEVEL_1 = BOOST_THRESHOLDS[0];
export const BOOSTS_FOR_LEVEL_2 = BOOST_THRESHOLDS[1];

// ─── Monedero de créditos (wallet) ─────────────────────────────────────────

/** Coste de UNA mejora de server pagada con el monedero. */
export const BOOST_CREDIT_COST = 100;

/**
 * Paquetes de recarga (productos del billing Gumroad existente).
 * `productId` se configura en GUMROAD_PRODUCT_PLAN_MAP vía env BOOST_PACK_*
 * — la venta se detecta por product_id en el webhook y nunca por el front.
 */
export interface CreditPack {
  id: 'pack_2' | 'pack_5' | 'pack_10';
  priceLabel: string;
  credits: number;
  /** Porcentaje de bonus incluido (0 = precio base). */
  bonusPercent: number;
}

export const CREDIT_PACKS: readonly CreditPack[] = [
  { id: 'pack_2', priceLabel: '2€', credits: 100, bonusPercent: 0 },
  { id: 'pack_5', priceLabel: '5€', credits: 275, bonusPercent: 10 },
  { id: 'pack_10', priceLabel: '10€', credits: 600, bonusPercent: 20 },
] as const;

/** Packs por id — lookup para el webhook (amount credited per product). */
export const CREDIT_PACKS_BY_ID: Record<CreditPack['id'], CreditPack> = {
  pack_2: CREDIT_PACKS[0]!,
  pack_5: CREDIT_PACKS[1]!,
  pack_10: CREDIT_PACKS[2]!,
};

export function isCreditPackId(value: string): value is CreditPack['id'] {
  return value === 'pack_2' || value === 'pack_5' || value === 'pack_10';
}

/** Rol cosmético asignado al miembro que compra una mejora. CERO permisos. */
export const BOOSTER_ROLE_DEFAULT_NAME = 'Server Booster';
export const BOOSTER_ROLE_COLOR = '#ff73fa';

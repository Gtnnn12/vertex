/**
 * Netrex Premium purchase + license configuration.
 *
 * Three purchasable plans, each its own Gumroad product:
 *  - monthly   → €6  (https://aceptado.gumroad.com/l/dztpfu)
 *  - sixMonths → €20 (https://aceptado.gumroad.com/l/kwuyu)
 *  - yearly    → €40 (https://aceptado.gumroad.com/l/zfjzsm)
 *
 * ⚠ The checkout URLs below are FINAL. The `productId` of sixMonths/yearly is
 * still a placeholder — paste the real product ids (Gumroad → product →
 * Share/Links, the `U7HOi…` style id) to enable gift-key license verify and
 * the server-side ping → plan mapping (packages/server netrex.ts).
 */

export type GumroadPlan = 'monthly' | 'sixMonths' | 'yearly';

export interface GumroadProduct {
  /** Product landing / checkout page (opened in the in-app BrowserWindow). */
  url: string;
  /** Product id for POST /v2/licenses/verify and the server's ping mapping. */
  productId: string;
}

export const GUMROAD_PRODUCTS: Record<GumroadPlan, GumroadProduct> = {
  monthly: {
    url: 'https://aceptado.gumroad.com/l/dztpfu',
    productId: 'U7HOiXnRmFeO5WU3xCP_MA==',
  },
  sixMonths: {
    url: 'https://aceptado.gumroad.com/l/kwuyu',
    productId: 'REEMPLAZAR-PRODUCT-ID-6M',
  },
  yearly: {
    url: 'https://aceptado.gumroad.com/l/zfjzsm',
    productId: 'REEMPLAZAR-PRODUCT-ID-YEARLY',
  },
};

/** True when a product is fully configured (real URL, not a placeholder). */
export function isProductConfigured(plan: GumroadPlan): boolean {
  const p = GUMROAD_PRODUCTS[plan];
  return Boolean(p.url) && !p.url.includes('REEMPLAZAR');
}

/** Gumroad license verify endpoint (gift-key path). */
export const GUMROAD_VERIFY_URL = 'https://api.gumroad.com/v2/licenses/verify';

/** Filename (inside Electron userData) of the encrypted license blob. */
export const LICENSE_STORE_FILE = 'netrex-license.bin';

/** Days an offline license stays trusted after its last successful online verify. */
export const LICENSE_GRACE_DAYS = 7;

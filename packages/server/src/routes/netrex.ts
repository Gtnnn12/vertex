import type { FastifyInstance, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { users } from '../db/schema.js';
import { authenticate } from '../utils/auth.js';

/**
 * Netrex Premium billing:
 *
 *  - POST /api/webhooks/gumroad  → Gumroad "Send pings" webhook. Verifies the
 *    HMAC-SHA256 signature, maps the Gumroad product to a plan, computes the
 *    entitlement end date and updates the matching user (by buyer email).
 *    Public (Gumroad calls it server-to-server, no session).
 *  - GET  /api/netrex/entitlement → authenticated; returns the caller's plan,
 *    expiry and active flag straight from the database.
 *
 * Plan windows: monthly +30d, six_months +180d, yearly +365d. For recurring
 * subscriptions Gumroad includes the next charge date in the ping — when
 * present it wins over the flat window.
 */

export type NetrexPlan = 'monthly' | 'six_months' | 'yearly' | 'lifetime';

const PLAN_DAYS: Record<Exclude<NetrexPlan, 'lifetime'>, number> = {
  monthly: 30,
  six_months: 180,
  yearly: 365,
};

/** Owner fills these from Gumroad's product pages (ping config shows it too). */
export const GUMROAD_PRODUCT_PLAN_MAP: Record<string, NetrexPlan> = {
  // 'U7HOiXnRmFeO5WU3xCP_MA==': 'monthly',   ← existing product (kept in sync with desktop config)
  // '<six-months-product-id>': 'six_months',
  // '<yearly-product-id>': 'yearly',
};

/**
 * Shared secret for ping signature verification. Configure the SAME value in
 * Gumroad (each product → Settings → Ping → secret) and here via env.
 * Unsigned pings are rejected once a secret is configured.
 */
function pingSecret(): string | null {
  return process.env.GUMROAD_PING_SECRET ?? null;
}

/** Constant-time HMAC check of Gumroad's X-Gumroad-Signature header. */
function verifyPingSignature(rawBody: string, signature: string | undefined): boolean {
  const secret = pingSecret();
  if (!secret) return true; // not configured yet — accept but log loudly
  if (!signature) return false;
  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch {
    return false;
  }
}

/** Plan for a ping's product_id; unknown products are logged and rejected. */
function planForProduct(productId: string): NetrexPlan | null {
  if (GUMROAD_PRODUCT_PLAN_MAP[productId]) return GUMROAD_PRODUCT_PLAN_MAP[productId];
  // The original monthly product (single source: desktop config uses the same id).
  if (productId === 'U7HOiXnRmFeO5WU3xCP_MA==') return 'monthly';
  return null;
}

/** Next-charge epoch ms from a ping, when the product is a subscription. */
function nextChargeAt(form: Record<string, string>): number | null {
  const raw = form.next_charge_date ?? form.next_charge_at ?? '';
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

interface EntitlementResponse {
  plan: NetrexPlan | null;
  until: number | null;
  active: boolean;
}

export async function netrexRoutes(app: FastifyInstance): Promise<void> {
  // Gumroad "Send pings" posts application/x-www-form-urlencoded — Fastify has
  // no built-in parser for it. Parse to an object but keep the raw string for
  // exact HMAC signature verification.
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (req, body, done) => {
    try {
      const raw = String(body);
      // Stash the exact bytes — HMAC must verify over what Gumroad actually sent.
      (req as FastifyRequest & { rawBody?: string }).rawBody = raw;
      done(null, Object.fromEntries(new URLSearchParams(raw)));
    } catch (err) {
      done(err as Error);
    }
  });

  // ── Gumroad ping webhook (public, signature-verified) ──
  app.post('/api/webhooks/gumroad', async (request, reply) => {
    const raw =
      (request as FastifyRequest & { rawBody?: string }).rawBody ??
      (typeof request.body === 'string'
        ? request.body
        : new URLSearchParams(
            Object.fromEntries(
              Object.entries((request.body ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
            ),
          ).toString());

    const signature = request.headers['x-gumroad-signature'] as string | undefined;
    if (!verifyPingSignature(raw, signature)) {
      console.warn('[gumroad-ping] REJECTED — bad or missing HMAC signature');
      return reply.code(401).send({ ok: false, error: 'bad_signature' });
    }

    // Gumroad posts form-encoded fields.
    const form: Record<string, string> =
      typeof request.body === 'string'
        ? Object.fromEntries(new URLSearchParams(raw))
        : Object.fromEntries(
            Object.entries((request.body ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
          );

    const productId = form.product_id ?? '';
    const email = (form.email ?? form.sale_email ?? '').trim().toLowerCase();
    const sellerId = form.seller_id ?? '';
    const refunded = form.refunded === 'true';
    const disputed = form.disputed === 'true';
    const chargebacked = form.chargebacked === 'true';

    console.log(
      `[gumroad-ping] received: product=${productId} email=${email ? `${email.slice(0, 3)}***` : '(none)'}` +
        ` refunded=${refunded} disputed=${disputed} chargebacked=${chargebacked}` +
        ` seller=${sellerId || 'n/a'} sig=${signature ? 'present' : 'MISSING'}`,
    );

    if (!email) {
      console.warn('[gumroad-ping] no buyer email — cannot match a user');
      return reply.code(400).send({ ok: false, error: 'missing_email' });
    }

    const plan = planForProduct(productId);
    if (!plan) {
      console.warn(`[gumroad-ping] unknown product_id ${productId} — add it to GUMROAD_PRODUCT_PLAN_MAP`);
      return reply.code(200).send({ ok: false, error: 'unknown_product' }); // 200 so Gumroad stops retrying
    }

    const db = getDb();

    // Refund / dispute / chargeback → revoke immediately.
    if (refunded || disputed || chargebacked) {
      const user = db.select({ id: users.id }).from(users).where(eq(users.billingEmail, email)).get();
      if (user) {
        db.update(users)
          .set({ netrexEnabled: 0, netrexPlan: null, netrexUntil: null })
          .where(eq(users.id, user.id))
          .run();
        console.log(`[gumroad-ping] revoked Netrex for ${email.slice(0, 3)}*** (${plan})`);
      } else {
        console.warn(`[gumroad-ping] refund for unknown user ${email.slice(0, 3)}***`);
      }
      return reply.send({ ok: true, revoked: true });
    }

    // Sale → extend entitlement. Recurring: next charge date wins.
    const until = nextChargeAt(form) ?? Date.now() + PLAN_DAYS[plan as Exclude<NetrexPlan, 'lifetime'>] * 24 * 60 * 60 * 1000;

    const user = db.select({ id: users.id }).from(users).where(eq(users.billingEmail, email)).get();
    if (!user) {
      console.warn(`[gumroad-ping] sale for unknown user ${email.slice(0, 3)}*** (plan ${plan})`);
      return reply.code(200).send({ ok: false, error: 'unknown_user' });
    }

    db.update(users)
      .set({ netrexEnabled: 1, netrexPlan: plan, netrexUntil: until })
      .where(eq(users.id, user.id))
      .run();

    console.log(`[gumroad-ping] ACTIVATED Netrex ${plan} for ${email.slice(0, 3)}*** until ${new Date(until).toISOString()}`);
    return reply.send({ ok: true, plan, until });
  });

  // ── Entitlement for the logged-in user ──
  app.get('/api/netrex/entitlement', { preHandler: authenticate }, async (request, reply): Promise<void> => {
    const db = getDb();
    const userId = (request as FastifyRequest & { userId: string }).userId;
    const user = db
      .select({
        netrexEnabled: users.netrexEnabled,
        netrexPlan: users.netrexPlan,
        netrexUntil: users.netrexUntil,
        netrexExpiresAt: users.netrexExpiresAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .get();

    if (!user) {
      void reply.code(404).send({ error: 'user_not_found' });
      return;
    }

    const until = user.netrexUntil ?? user.netrexExpiresAt ?? null;
    // Legacy netrexEnabled (admin-granted, no expiry) counts as active too.
    const active = user.netrexEnabled === 1 && (until === null || until > Date.now());
    const response: EntitlementResponse = {
      plan: (user.netrexPlan as NetrexPlan | null) ?? (active ? 'lifetime' : null),
      until: active ? until : null,
      active,
    };
    void reply.send(response);
  });
}

import type { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { getDb, schema, type DB } from '../db/index.js';
import { authenticate } from '../utils/auth.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { CREDIT_PACKS, CREDIT_PACKS_BY_ID, isCreditPackId, BOOST_CREDIT_COST } from '@backspace/shared/src/evoConstants.js';
import type {
  CreditBalance,
  CreditHistory,
  CreditPurchaseRequest,
  CreditPurchaseResponse,
} from '@backspace/shared';

/**
 * Monedero de créditos (wallet):
 *
 *  - GET  /api/credits/balance      → saldo actual (server-side, nunca minteado por el front).
 *  - GET  /api/credits/transactions → historial auditado de movimientos.
 *  - POST /api/credits/purchase     → inicia la compra de un paquete: devuelve el
 *    checkout del billing. Los créditos NO se añaden aquí — solo cuando el
 *    webhook del billing (venta confirmada server-to-server) acredita el pack
 *    vía creditWallet, que también escribe la transacción de auditoría.
 *
 * TODA variación de users.creditBalance pasa por creditWallet() — el saldo
 * nunca cambia sin su fila en credit_transactions.
 */

export interface WalletDelta {
  userId: string;
  /** Signed: positive = top-up, negative = spend. */
  amount: number;
  /** Audit reason, e.g. 'topup:pack_5' | 'spend:boost:<spaceId>'. */
  reason: string;
}

/** Transaction handle type — the same object db.transaction(cb) passes. */
type WalletTx = Parameters<Parameters<DB['transaction']>[0]>[0];

/**
 * Core mutation — runs on the given handle. Verifies sufficient funds for
 * spends, applies the delta and writes the audit row. Throws a 400-shaped
 * error (code 'insufficient_credits') on overdraft. Exported so callers can
 * compose the wallet debit INTO a larger transaction (e.g. spend credits +
 * create the boost atomically).
 */
export function applyWalletDelta(tx: WalletTx, delta: WalletDelta): number {
  const row = tx.select({ creditBalance: schema.users.creditBalance })
    .from(schema.users)
    .where(eq(schema.users.id, delta.userId))
    .get();
  const current = row?.creditBalance ?? 0;
  if (delta.amount < 0 && current + delta.amount < 0) {
    const err = new Error('Insufficient credits') as Error & { statusCode: number; code: string };
    err.statusCode = 400;
    err.code = 'insufficient_credits';
    throw err;
  }
  const newBalance = current + delta.amount;
  tx.update(schema.users)
    .set({ creditBalance: newBalance })
    .where(eq(schema.users.id, delta.userId))
    .run();
  tx.insert(schema.creditTransactions).values({
    id: generateSnowflake(),
    userId: delta.userId,
    amount: delta.amount,
    reason: delta.reason,
    createdAt: Date.now(),
  }).run();
  return newBalance;
}

/**
 * Single chokepoint for balance mutations. Every variation of
 * users.creditBalance goes through here (plus its audit row).
 */
export function creditWallet(delta: WalletDelta): number {
  const db = getDb();
  let newBalance = 0;
  db.transaction((tx) => {
    newBalance = applyWalletDelta(tx, delta);
  });
  return newBalance;
}

export async function creditsRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/credits/balance — saldo del usuario autenticado.
  app.get('/api/credits/balance', { preHandler: authenticate }, async (request, reply) => {
    const db = getDb();
    const row = db.select({ creditBalance: schema.users.creditBalance })
      .from(schema.users)
      .where(eq(schema.users.id, request.userId))
      .get();
    const body: CreditBalance = { balance: row?.creditBalance ?? 0 };
    return reply.code(200).send(body);
  });

  // GET /api/credits/transactions — historial de movimientos (más reciente primero).
  app.get('/api/credits/transactions', { preHandler: authenticate }, async (request, reply) => {
    const db = getDb();
    const rows = db.select()
      .from(schema.creditTransactions)
      .where(eq(schema.creditTransactions.userId, request.userId))
      .orderBy(desc(schema.creditTransactions.createdAt))
      .limit(100)
      .all();
    const body: CreditHistory = {
      transactions: rows.map((r) => ({
        id: r.id,
        amount: r.amount,
        reason: r.reason,
        createdAt: r.createdAt,
      })),
    };
    return reply.code(200).send(body);
  });

  // POST /api/credits/purchase — inicia la compra de un paquete de recarga.
  // Validación de pack aquí; el cobro lo hace el billing (Gumroad) y los
  // créditos se acreditan únicamente en el webhook server-side.
  app.post<{ Body: CreditPurchaseRequest }>('/api/credits/purchase', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { packId } = request.body ?? {} as CreditPurchaseRequest;
    if (!isCreditPackId(packId)) {
      return reply.code(400).send({ error: 'Invalid credit pack', code: 'invalid_pack', statusCode: 400 });
    }
    const pack = CREDIT_PACKS_BY_ID[packId];

    // Checkout URL: configurable por env (mismo patrón que los planes Netrex).
    // Null = producto aún no configurado — el front muestra "próximamente".
    const envKey = `CREDIT_PACK_URL_${pack.id.toUpperCase()}`;
    const checkoutUrl = process.env[envKey] ?? null;

    const response: CreditPurchaseResponse = {
      ok: true,
      packId: pack.id,
      checkoutUrl,
    };
    return reply.code(200).send(response);
  });

  // GET /api/credits/packs — catálogo de paquetes para la tienda (single source: shared).
  app.get('/api/credits/packs', { preHandler: authenticate }, async (_request, reply) => {
    return reply.code(200).send({ packs: CREDIT_PACKS });
  });

  // POST /api/credits/purchase-netrex — compra un mes de Netrex con créditos
  // del monedero (600 créditos = 6€ = plan monthly). Reutiliza el flujo de
  // entitlement completo: extiende netrexUntil desde ahora (o desde la
  // expiración actual si sigue activa) y marca netrexEnabled=1. Débito
  // auditado con reason spend:netrex:monthly. 400 insufficient_credits si
  // el saldo no llega.
  app.post('/api/credits/purchase-netrex', { preHandler: authenticate }, async (request, reply) => {
    const cost = 6 * BOOST_CREDIT_COST; // 600 créditos = 1 mes (6€)
    const db = getDb();
    const user = db.select({
      netrexEnabled: schema.users.netrexEnabled,
      netrexUntil: schema.users.netrexUntil,
    }).from(schema.users).where(eq(schema.users.id, request.userId)).get();
    if (!user) {
      return reply.code(404).send({ error: 'User not found', statusCode: 404 });
    }

    const now = Date.now();
    // Extiende desde la expiración actual si sigue activa; si no, desde ahora.
    const currentUntil = user.netrexUntil ?? 0;
    const base = user.netrexEnabled === 1 && currentUntil > now ? currentUntil : now;
    const newUntil = base + 30 * 24 * 60 * 60 * 1000;

    try {
      db.transaction((tx) => {
        applyWalletDelta(tx, {
          userId: request.userId,
          amount: -cost,
          reason: 'spend:netrex:monthly',
        });
        tx.update(schema.users)
          .set({ netrexEnabled: 1, netrexPlan: 'monthly', netrexUntil: newUntil })
          .where(eq(schema.users.id, request.userId))
          .run();
      });
    } catch (e) {
      const ev = e as Error & { statusCode?: number; code?: string };
      if (ev.statusCode === 400 && ev.code === 'insufficient_credits') {
        return reply.code(400).send({
          error: 'Insufficient credits — Netrex costs 600 credits per month',
          code: 'insufficient_credits',
          statusCode: 400,
        });
      }
      throw e;
    }

    return reply.code(200).send({ ok: true, plan: 'monthly', until: newUntil, spent: cost });
  });
}

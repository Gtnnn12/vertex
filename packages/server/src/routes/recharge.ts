import type { FastifyInstance } from 'fastify';
import { eq, and, desc, asc, inArray } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { authenticate, requireAdmin } from '../utils/auth.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { isCreditPackId, CREDIT_PACKS_BY_ID } from '@backspace/shared/src/evoConstants.js';
import type {
  RechargeTicket,
  RechargeMessage,
  RechargeTicketWithMessages,
} from '@backspace/shared';
import { creditWallet } from './credits.js';

/**
 * Chat de compra — recargas dentro de la app, sin web externa:
 * 1. El usuario elige un paquete en el modal de Créditos, paga a paypal.me/MarioCortes1
 *    con nota VERTEX-<username> y pulsa "Ya he pagado" → crea un ticket open.
 * 2. Usuario y staff intercambian mensajes (texto y capturas reutilizando la subida
 *    existente de la app) en su ticket.
 * 3. El admin aprueba (acredita créditos del pack vía creditWallet, reason
 *    "purchase:ticket") o rechaza con nota. Un mensaje de sistema lo deja en el chat.
 * Máximo 1 ticket abierto por usuario.
 */

const TICKET_PACKS = ['2', '5', '10'] as const;
void TICKET_PACKS;

function rowToTicket(r: typeof schema.rechargeTickets.$inferSelect): RechargeTicket {
  return {
    id: r.id,
    userId: r.userId,
    packId: r.packId,
    status: r.status as RechargeTicket['status'],
    createdAt: r.createdAt,
    resolvedAt: r.resolvedAt ?? null,
    adminNote: r.adminNote ?? null,
  };
}

function rowToMessage(m: typeof schema.rechargeMessages.$inferSelect): RechargeMessage {
  return {
    id: m.id,
    ticketId: m.ticketId,
    senderUserId: m.senderUserId ?? 'system',
    senderRole: m.senderRole as RechargeMessage['senderRole'],
    body: m.body ?? null,
    imageUrl: m.imageUrl ?? null,
    createdAt: m.createdAt,
  };
}

function getTicketMessages(ticketId: string): RechargeMessage[] {
  const db = getDb();
  return db
    .select()
    .from(schema.rechargeMessages)
    .where(eq(schema.rechargeMessages.ticketId, ticketId))
    .orderBy(asc(schema.rechargeMessages.createdAt))
    .all()
    .map(rowToMessage);
}

/** Registra un mensaje del sistema en el chat del ticket (aprobado/rechazado). */
function postSystemMessage(ticketId: string, body: string): void {
  const db = getDb();
  db.insert(schema.rechargeMessages)
    .values({
      id: generateSnowflake(),
      ticketId,
      senderUserId: null,
      senderRole: 'system',
      body,
      imageUrl: null,
      createdAt: Date.now(),
    })
    .run();
}

export async function registerRechargeRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();

  // ─── Usuario ──────────────────────────────────────────────────────────────

  // Crea un ticket open ("Ya he pagado"). Máx 1 abierto por usuario.
  app.post('/api/credits/recharge', { preHandler: [authenticate] }, async (req, reply) => {
    const userId = req.userId;
    const { packId } = (req.body ?? {}) as { packId?: string };

    const packIdStr = String(packId ?? '');
    if (!isCreditPackId(packIdStr)) {
      return reply.code(400).send({ error: 'invalid_pack' });
    }
    const open = db
      .select({ id: schema.rechargeTickets.id })
      .from(schema.rechargeTickets)
      .where(and(eq(schema.rechargeTickets.userId, userId), eq(schema.rechargeTickets.status, 'open')))
      .get();
    if (open) {
      return reply.code(409).send({ error: 'ticket_already_open', ticketId: open.id });
    }

    const id = generateSnowflake();
    const now = Date.now();
    db.insert(schema.rechargeTickets)
      .values({ id, userId, packId: packIdStr, status: 'open', createdAt: now, resolvedAt: null, adminNote: null })
      .run();

    postSystemMessage(
      id,
      'SYSTEM_TICKET_CREATED',
    );

    const ticket = rowToTicket(db.select().from(schema.rechargeTickets).where(eq(schema.rechargeTickets.id, id)).get()!);
    const payload: RechargeTicketWithMessages = { ticket, messages: getTicketMessages(id) };
    return reply.code(201).send(payload);
  });

  // Ticket propio + mensajes.
  app.get('/api/credits/recharge/my', { preHandler: [authenticate] }, async (req, reply) => {
    const userId = req.userId;
    const row = db
      .select()
      .from(schema.rechargeTickets)
      .where(eq(schema.rechargeTickets.userId, userId))
      .orderBy(desc(schema.rechargeTickets.createdAt))
      .get();

    if (!row) return reply.send({ ticket: null, messages: [] });
    const payload: RechargeTicketWithMessages = { ticket: rowToTicket(row), messages: getTicketMessages(row.id) };
    return reply.send(payload);
  });

  // El usuario envía mensaje/captura a SU ticket (solo abierto).
  app.post('/api/credits/recharge/my/message', { preHandler: [authenticate] }, async (req, reply) => {
    const userId = req.userId;
    const { body, imageUrl } = (req.body ?? {}) as { body?: string | null; imageUrl?: string | null };

    const text = typeof body === 'string' ? body.trim() : '';
    const img = typeof imageUrl === 'string' ? imageUrl.trim() : '';
    if (!text && !img) return reply.code(400).send({ error: 'empty_message' });
    if (text.length > 2000) return reply.code(400).send({ error: 'message_too_long' });

    const ticket = db
      .select()
      .from(schema.rechargeTickets)
      .where(eq(schema.rechargeTickets.userId, userId))
      .orderBy(desc(schema.rechargeTickets.createdAt))
      .get();
    if (!ticket) return reply.code(404).send({ error: 'no_ticket' });
    if (ticket.status !== 'open') return reply.code(409).send({ error: 'ticket_closed' });

    const id = generateSnowflake();
    db.insert(schema.rechargeMessages)
      .values({
        id,
        ticketId: ticket.id,
        senderUserId: userId,
        senderRole: 'user',
        body: text || null,
        imageUrl: img || null,
        createdAt: Date.now(),
      })
      .run();

    return reply.code(201).send({ message: rowToMessage(db.select().from(schema.rechargeMessages).where(eq(schema.rechargeMessages.id, id)).get()!) });
  });

  // ─── Admin ────────────────────────────────────────────────────────────────

  // Cola de tickets (abiertos por defecto, ?status=approved|rejected|all para historial).
  app.get('/api/admin/recharge', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => {

    const statusParam = (req.query as { status?: string } | undefined)?.status;
    const rows =
      statusParam && statusParam !== 'all'
        ? db
            .select()
            .from(schema.rechargeTickets)
            .where(eq(schema.rechargeTickets.status, statusParam as RechargeTicket['status']))
            .orderBy(desc(schema.rechargeTickets.createdAt))
            .all()
        : db.select().from(schema.rechargeTickets).orderBy(desc(schema.rechargeTickets.createdAt)).all();

    // Adjunta username para la bandeja.
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const users = userIds.length
      ? db.select({ id: schema.users.id, username: schema.users.username }).from(schema.users).where(inArray(schema.users.id, userIds)).all()
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.username]));

    return reply.send({
      tickets: rows.map((r) => ({ ...rowToTicket(r), username: nameById.get(r.userId) ?? r.userId })),
    });
  });

  // Chat completo de un ticket (para la bandeja admin).
  app.get('/api/admin/recharge/:id', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const ticket = db.select().from(schema.rechargeTickets).where(eq(schema.rechargeTickets.id, id)).get();
    if (!ticket) return reply.code(404).send({ error: 'not_found' });

    const user = db.select({ id: schema.users.id, username: schema.users.username }).from(schema.users).where(eq(schema.users.id, ticket.userId)).get();
    const payload: RechargeTicketWithMessages & { username: string } = {
      ticket: rowToTicket(ticket),
      messages: getTicketMessages(id),
      username: user?.username ?? ticket.userId,
    };
    return reply.send(payload);
  });

  // Responde como admin en un ticket (abierto o resuelto).
  app.post('/api/admin/recharge/:id/message', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { body, imageUrl } = (req.body ?? {}) as { body?: string | null; imageUrl?: string | null };

    const text = typeof body === 'string' ? body.trim() : '';
    const img = typeof imageUrl === 'string' ? imageUrl.trim() : '';
    if (!text && !img) return reply.code(400).send({ error: 'empty_message' });
    if (text.length > 2000) return reply.code(400).send({ error: 'message_too_long' });

    const ticket = db.select().from(schema.rechargeTickets).where(eq(schema.rechargeTickets.id, id)).get();
    if (!ticket) return reply.code(404).send({ error: 'not_found' });

    const mid = generateSnowflake();
    db.insert(schema.rechargeMessages)
      .values({
        id: mid,
        ticketId: id,
        senderUserId: req.userId,
        senderRole: 'admin',
        body: text || null,
        imageUrl: img || null,
        createdAt: Date.now(),
      })
      .run();

    return reply.code(201).send({ message: rowToMessage(db.select().from(schema.rechargeMessages).where(eq(schema.rechargeMessages.id, mid)).get()!) });
  });

  // Aprueba: acredita los créditos del pack + mensaje de sistema en el chat.
  app.post('/api/admin/recharge/:id/approve', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { note } = (req.body ?? {}) as { note?: string | null };

    const ticket = db.select().from(schema.rechargeTickets).where(eq(schema.rechargeTickets.id, id)).get();
    if (!ticket) return reply.code(404).send({ error: 'not_found' });
    if (ticket.status !== 'open') return reply.code(409).send({ error: 'ticket_already_resolved' });

    const pack = CREDIT_PACKS_BY_ID[ticket.packId as keyof typeof CREDIT_PACKS_BY_ID];
    if (!pack) return reply.code(500).send({ error: 'invalid_pack' });

    // Acredita con auditoría (reason "purchase:ticket").
    creditWallet({ userId: ticket.userId, amount: pack.credits, reason: `purchase:ticket:${ticket.packId}` });

    const now = Date.now();
    db.update(schema.rechargeTickets)
      .set({ status: 'approved', resolvedAt: now, adminNote: note ?? null })
      .where(eq(schema.rechargeTickets.id, id))
      .run();

    postSystemMessage(id, note ? `SYSTEM_APPROVED:${note}` : 'SYSTEM_APPROVED');

    const payload: RechargeTicketWithMessages = { ticket: rowToTicket({ ...ticket, status: 'approved', resolvedAt: now, adminNote: note ?? null }), messages: getTicketMessages(id) };
    return reply.send(payload);
  });

  // Rechaza con nota (obligatoria).
  app.post('/api/admin/recharge/:id/reject', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { note } = (req.body ?? {}) as { note?: string | null };

    const text = typeof note === 'string' ? note.trim() : '';
    if (!text) return reply.code(400).send({ error: 'note_required' });

    const ticket = db.select().from(schema.rechargeTickets).where(eq(schema.rechargeTickets.id, id)).get();
    if (!ticket) return reply.code(404).send({ error: 'not_found' });
    if (ticket.status !== 'open') return reply.code(409).send({ error: 'ticket_already_resolved' });

    const now = Date.now();
    db.update(schema.rechargeTickets)
      .set({ status: 'rejected', resolvedAt: now, adminNote: text })
      .where(eq(schema.rechargeTickets.id, id))
      .run();

    postSystemMessage(id, `SYSTEM_REJECTED:${text}`);

    const payload: RechargeTicketWithMessages = { ticket: rowToTicket({ ...ticket, status: 'rejected', resolvedAt: now, adminNote: text }), messages: getTicketMessages(id) };
    return reply.send(payload);
  });
}

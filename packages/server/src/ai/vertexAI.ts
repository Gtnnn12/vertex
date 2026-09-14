import { GoogleGenerativeAI } from '@google/generative-ai';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import type { FastifyRequest } from 'fastify';
import crypto from 'crypto';

/**
 * Vertex AI — Gemini-backed assistant.
 *
 * Tiering: free users run the fast `gemini-2.0-flash` model; Netrex users
 * run `gemini-2.5-pro`, falling back to flash on quota/rate errors (never a
 * hard failure). Daily message limits + rolling conversation context are
 * in-memory (per process) — simple, and resets are harmless by design.
 */

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY ?? '';

// "latest" aliases: pinned model names (gemini-2.x) 404 for new keys —
// Google rotates them out; the alias always points at a live model.
const MODEL_FLASH = 'gemini-flash-latest';
const MODEL_PRO = 'gemini-pro-latest';

const DAILY_LIMIT_FREE = 20;
const DAILY_LIMIT_NETREX = 100;

const CONTEXT_MESSAGES = 10;

export const ASSISTANT_SYSTEM_PROMPT =
  'Eres Vertex AI, el asistente de la app VERTEX, una app de chat/comunidad. ' +
  'Responde en el idioma del usuario, sé útil y conciso.';

export const SUPPORT_SYSTEM_PROMPT =
  'Eres el canal de dudas oficial de VERTEX, una app de chat/comunidad con ' +
  'servidores (spaces), canales de texto y voz, mensajería directa, perfiles ' +
  'con tablero de widgets, integración de Spotify, y Netrex (la suscripción ' +
  'premium que desbloquea estilos de widget de música, temas personalizados ' +
  'y streaming de mayor calidad). Responde en el idioma del usuario, con ' +
  'respuestas CORTAS y prácticas, SOLO sobre el funcionamiento de VERTEX. ' +
  'Si preguntan cualquier otra cosa, redirige amablemente a dudas sobre la app.';

const genAI = GOOGLE_API_KEY ? new GoogleGenerativeAI(GOOGLE_API_KEY) : null;

export function isAIConfigured(): boolean {
  return !!genAI;
}

// ── Netrex entitlement (same gate the rest of the server uses) ─────────────
// Local copy of routes/users.ts computeNetrexEntitlement to avoid a
// route-module import cycle. Same fallback chain: purchased plan (netrexUntil
// in the future) wins; legacy admin-grant (netrexEnabled=1, unexpired via
// netrexExpiresAt) backs it up. A grant without expiry never lapses.
function isNetrexUser(userId: string): boolean {
  try {
    const row = getDb().select().from(schema.users).where(eq(schema.users.id, userId)).get();
    if (!row) return false;
    const until = row.netrexUntil ?? row.netrexExpiresAt ?? null;
    const granted = row.netrexEnabled === 1 && (until === null || until > Date.now());
    const purchased = row.netrexUntil != null && row.netrexUntil > Date.now();
    return granted || purchased;
  } catch {
    return false;
  }
}

// ── Daily usage (in-memory) ─────────────────────────────────────────────────
const DAY_MS = 24 * 60 * 60 * 1000;
interface UsageBucket {
  windowStart: number;
  count: number;
}
const usage = new Map<string, UsageBucket>();

function dailyLimitFor(userId: string): number {
  return isNetrexUser(userId) ? DAILY_LIMIT_NETREX : DAILY_LIMIT_FREE;
}

/** Returns remaining messages today, or 0 when the limit is exhausted. */
export function remainingToday(userId: string): number {
  const now = Date.now();
  const bucket = usage.get(userId);
  if (!bucket || now - bucket.windowStart >= DAY_MS) return dailyLimitFor(userId);
  return Math.max(0, dailyLimitFor(userId) - bucket.count);
}

function consume(userId: string): void {
  const now = Date.now();
  const bucket = usage.get(userId);
  if (!bucket || now - bucket.windowStart >= DAY_MS) {
    usage.set(userId, { windowStart: now, count: 1 });
  } else {
    bucket.count += 1;
  }
}

// ── Conversation context (in-memory, last N messages per user) ─────────────
interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}
const conversations = new Map<string, ChatTurn[]>();

function getHistory(userId: string, scope: string): ChatTurn[] {
  return conversations.get(`${scope}:${userId}`) ?? [];
}

function appendHistory(userId: string, scope: string, turn: ChatTurn): void {
  const key = `${scope}:${userId}`;
  const history = conversations.get(key) ?? [];
  history.push(turn);
  while (history.length > CONTEXT_MESSAGES) history.shift();
  conversations.set(key, history);
}

export function resetConversation(userId: string, scope: string): void {
  conversations.delete(`${scope}:${userId}`);
}

// ── Generation ──────────────────────────────────────────────────────────────
export interface AIChatResult {
  ok: true;
  text: string;
  model: string;
  netrex: boolean;
  remaining: number;
}
export interface AIChatError {
  ok: false;
  error: 'not_configured' | 'limit' | 'upstream';
  message: string;
}

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /429|quota|rate|exhaust|resource/i.test(msg);
}

async function generate(
  systemPrompt: string,
  history: ChatTurn[],
  userText: string,
  netrex: boolean,
): Promise<{ text: string; model: string }> {
  if (!genAI) throw new Error('not_configured');

  const attempt = async (modelName: string): Promise<{ text: string; model: string }> => {
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: systemPrompt,
    });
    const chat = model.startChat({ history: history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })) });
    const result = await chat.sendMessage(userText);
    const text = result.response.text();
    return { text, model: modelName };
  };

  if (netrex) {
    // PRO first; flash fallback on quota — never a dry error.
    try {
      return await attempt(MODEL_PRO);
    } catch (err) {
      if (isQuotaError(err)) return attempt(MODEL_FLASH);
      throw err;
    }
  }
  return attempt(MODEL_FLASH);
}

/** Shared pipeline for the assistant and the app-support channel. */
export async function runAIChat(
  userId: string,
  scope: 'assistant' | 'support',
  userText: string,
): Promise<AIChatResult | AIChatError> {
  if (!isAIConfigured()) {
    return { ok: false, error: 'not_configured', message: 'Vertex AI no está configurado en este servidor.' };
  }
  if (remainingToday(userId) <= 0) {
    return { ok: false, error: 'limit', message: 'Has llegado al límite de hoy. Vuelve mañana para seguir chateando.' };
  }

  const netrex = isNetrexUser(userId);
  const history = getHistory(userId, scope);
  try {
    const systemPrompt = scope === 'support' ? SUPPORT_SYSTEM_PROMPT : ASSISTANT_SYSTEM_PROMPT;
    const { text, model } = await generate(systemPrompt, history, userText, netrex);
    consume(userId);
    appendHistory(userId, scope, { role: 'user', text: userText });
    appendHistory(userId, scope, { role: 'model', text });
    return { ok: true, text, model, netrex, remaining: remainingToday(userId) };
  } catch {
    return { ok: false, error: 'upstream', message: 'Vertex AI no pudo responder ahora mismo. Inténtalo de nuevo.' };
  }
}

/** Tiny helper so routes never touch the model layer directly. */
export function hashKey(prefix: string): string {
  return crypto.createHash('sha256').update(prefix).digest('hex').slice(0, 8);
}

/** Type guard used by routes to narrow request bodies. */
export function readChatBody(body: unknown): { message: string } | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.message !== 'string' || b.message.trim().length === 0 || b.message.length > 4000) return null;
  return { message: b.message.trim() };
}

export type { FastifyRequest };

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../utils/auth.js';
import { runAIChat, readChatBody, remainingToday, resetConversation, isAIConfigured } from '../ai/vertexAI.js';

/**
 * Vertex AI routes — the Gemini key lives ONLY in the server process.
 * Clients call POST /api/ai/:scope with their session; the server attaches
 * the key, enforces tiering (free/Netrex model, daily limits) and returns
 * the full response (no streaming for now).
 */
export async function registerAIRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/ai/chat', { preHandler: authenticate }, async (request, reply) => {
    const body = readChatBody(request.body);
    if (!body) return reply.code(400).send({ error: 'invalid_body' });
    const userId = (request as unknown as { userId: string }).userId;
    const result = await runAIChat(userId, 'assistant', body.message);
    if (!result.ok) return reply.code(result.error === 'limit' ? 429 : 503).send(result);
    return result;
  });

  // App-questions channel: same engine, app-only system prompt.
  app.post('/api/ai/support', { preHandler: authenticate }, async (request, reply) => {
    const body = readChatBody(request.body);
    if (!body) return reply.code(400).send({ error: 'invalid_body' });
    const userId = (request as unknown as { userId: string }).userId;
    const result = await runAIChat(userId, 'support', body.message);
    if (!result.ok) return reply.code(result.error === 'limit' ? 429 : 503).send(result);
    return result;
  });

  app.get('/api/ai/status', { preHandler: authenticate }, async (request) => {
    const userId = (request as unknown as { userId: string }).userId;
    const result = remainingToday(userId);
    return { configured: isAIConfigured(), remaining: result };
  });

  app.post('/api/ai/reset', { preHandler: authenticate }, async (request) => {
    const userId = (request as unknown as { userId: string }).userId;
    const body = (request.body ?? {}) as { scope?: string };
    const scope = body.scope === 'support' ? 'support' : 'assistant';
    resetConversation(userId, scope);
    return { ok: true };
  });
}

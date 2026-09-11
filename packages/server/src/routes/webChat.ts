import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

/**
 * POST /api/chat — Gemini-powered FAQ assistant for the marketing site widget.
 *
 * Strict grounding: the model only ever sees the FAQ bank (mirrored verbatim
 * from the site's src/data/faq.ts). Anything the FAQ can't answer gets the
 * fixed deflect-to-/support reply, so the assistant can never invent features,
 * prices, dates, or mention external channels. No auth required; rate limited
 * per IP. The API key lives exclusively in the backend env (GOOGLE_API_KEY) —
 * it is never sent to the browser.
 */

// ─── FAQ knowledge bank (keep in sync with vertex-web/src/data/faq.ts) ──────

interface FaqEntry {
  id: string;
  q_en: string;
  q_es: string;
  a_en: string;
  a_es: string;
}

export const FAQ_BANK: FaqEntry[] = [
  {
    id: 'what-is-vertex',
    q_en: 'What is Vertex?',
    q_es: '¿Qué es Vertex?',
    a_en: 'Vertex is a real-time communication app: voice, 4K video and screen sharing. It is open source and created by Gtnnn12.',
    a_es: 'Vertex es una app de comunicación en tiempo real: voz, vídeo 4K y screen sharing. Es open source y la crea Gtnnn12.',
  },
  {
    id: 'netrex-price',
    q_en: 'How much does Netrex cost?',
    q_es: '¿Cuánto cuesta Netrex?',
    a_en: 'Netrex costs €4.99/month, €20 per 6 months or €40 per year, sold through Gumroad.',
    a_es: 'Netrex cuesta 4,99 €/mes, 20 € cada 6 meses o 40 € al año, y se compra vía Gumroad.',
  },
  {
    id: 'netrex-includes',
    q_en: 'What does Netrex include?',
    q_es: '¿Qué incluye Netrex?',
    a_en: 'Netrex includes exclusive themes and effects, a badge, priority support and early access.',
    a_es: 'Netrex incluye temas y efectos exclusivos, insignia, soporte prioritario y acceso anticipado.',
  },
  {
    id: 'beta-when',
    q_en: 'When does the beta launch?',
    q_es: '¿Cuándo sale la beta?',
    a_en: 'The beta arrives in 2026, Windows first. It will be announced in the Updates section of this page.',
    a_es: 'La beta llega en 2026, primero en Windows. Se anunciará en la sección Updates de esta página.',
  },
  {
    id: 'join-beta',
    q_en: 'How do I join the beta?',
    q_es: '¿Cómo me uno a la beta?',
    a_en: 'Right here: create your account, follow the Updates section and we will notify you through this site.',
    a_es: 'Aquí mismo: crea tu cuenta, sigue la sección Updates y te avisaremos por la web.',
  },
  {
    id: 'vertex-free',
    q_en: 'Is Vertex free?',
    q_es: '¿Es gratis Vertex?',
    a_en: 'Yes — the core of Vertex is free. Netrex is an optional add-on.',
    a_es: 'Sí — lo esencial de Vertex es gratis. Netrex es un extra opcional.',
  },
  {
    id: 'report-bug',
    q_en: 'How do I report a bug?',
    q_es: '¿Cómo reporto un bug?',
    a_en: 'Use the support form on this page (the /support section, "bug" category) — I read every message personally.',
    a_es: 'Usa el formulario de soporte de esta página (sección /support, categoría "bug"); lo leo personalmente.',
  },
  {
    id: 'refund',
    q_en: 'Can I get a refund on Netrex?',
    q_es: '¿Puedo reembolsar Netrex?',
    a_en: 'Yes, within 14 days. Manage it yourself at gumroad.com/library with the email you used to buy.',
    a_es: 'Sí, dentro de 14 días. Gestiónalo tú mismo en gumroad.com/library con el email de compra.',
  },
  {
    id: 'mobile',
    q_en: 'Will there be a mobile version?',
    q_es: '¿Habrá versión móvil?',
    a_en: 'A mobile version is planned, with no date yet. It will be announced in Updates.',
    a_es: 'La versión móvil está prevista, sin fecha todavía. Se anunciará en Updates.',
  },
  {
    id: 'who-makes',
    q_en: 'Who makes Vertex?',
    q_es: '¿Quién hace Vertex?',
    a_en: 'Vertex is made by Gtnnn12, an indie developer (gtnnn12.github.io).',
    a_es: 'Vertex lo hace Gtnnn12, desarrollador indie (gtnnn12.github.io).',
  },
];

// Fixed answers for anything outside the FAQ bank. They must never mention
// external channels (Discord, socials) — the whole point is that the visitor
// stays on this site, either with the assistant or the /support form.
const FALLBACK_ES =
  'Eso me lo guardo para el equipo — deja tu mensaje en el formulario de soporte de esta página (/support) y te responderán personalmente.';
const FALLBACK_EN =
  "I'll save that for the team — leave your message in the support form on this page (/support) and they'll answer you personally.";

function buildSystemPrompt(langHint: string): string {
  const faqText = FAQ_BANK.map(
    (f, i) => `${i + 1}. [EN] Q: ${f.q_en}\n   A: ${f.a_en}\n   [ES] Q: ${f.q_es}\n   A: ${f.a_es}`,
  ).join('\n');

  return [
    'You are the Vertex assistant on the official Vertex website.',
    'Answer ONLY using the content of this FAQ. Do not use any other knowledge.',
    '',
    '=== FAQ (verbatim) ===',
    faqText,
    '=== END FAQ ===',
    '',
    'Rules:',
    '- If the question is covered by the FAQ, answer with that content rephrased naturally (keep facts identical: prices, dates, links).',
    '- If the question is NOT in the FAQ, or needs personalized help (complex bug, complaint, payment problem), reply EXACTLY with: "' + FALLBACK_ES + '" if the user writes in Spanish, or "' + FALLBACK_EN + '" if they write in English.',
    '- NEVER mention Discord, social networks, or any external links other than gumroad.com/library (refunds only).',
    '- NEVER invent features, prices, dates, or promises. If you do not know it and it is not in the FAQ, use the exact fallback reply.',
    '- Maximum 3 short sentences. Friendly tone.',
    '- Reply in the user\'s language (English or Spanish). ' + langHint,
  ].join('\n');
}

const GEMINI_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

interface GeminiCandidate {
  content?: { parts?: { text?: string }[] };
}

async function askGemini(question: string, langHint: string): Promise<string> {
  const res = await fetch(GEMINI_URL(config.geminiModel), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.googleApiKey as string,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: buildSystemPrompt(langHint) }] },
      contents: [{ role: 'user', parts: [{ text: question.slice(0, 1000) }] }],
      generationConfig: {
        temperature: 0.3,
        // gemini-3.x flash spends tokens thinking before answering; a tight
        // cap truncates the reply mid-sentence. Dynamic thinking (-1) keeps
        // answers short and complete.
        maxOutputTokens: 1024,
        thinkingConfig: { thinkingBudget: -1 },
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini API ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { candidates?: GeminiCandidate[] };
  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim() ?? '';
  if (!text) throw new Error('Gemini returned an empty candidate');
  return text;
}

export async function webChatRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { message?: unknown } }>(
    '/api/chat',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { message } = request.body ?? {};
      if (typeof message !== 'string' || message.trim().length === 0 || message.length > 1000) {
        return reply.code(400).send({ error: 'Message is required (max 1000 chars)', statusCode: 400 });
      }

      // Cheap language sniff so the fallback + system prompt lean the right
      // way even when the model is unreachable.
      const langHint = /[¿¡ñáéíóúü]|hola|cuanto|cuesta|precio|que es|por que/i.test(message)
        ? 'The user is most likely writing in Spanish.'
        : 'The user is most likely writing in English.';

      if (!config.googleApiKey) {
        // No key configured: stay honest and point at the on-site form.
        return reply.code(200).send({ reply: langHint.includes('Spanish') ? FALLBACK_ES : FALLBACK_EN, source: 'fallback' });
      }

      try {
        const text = await askGemini(message.trim(), langHint);
        return reply.code(200).send({ reply: text, source: 'gemini' });
      } catch (err) {
        request.log.warn({ err }, 'Gemini chat failed');
        return reply.code(200).send({
          reply: langHint.includes('Spanish')
            ? 'Ahora mismo no puedo responder — déjalo en el formulario de soporte de esta página (/support).'
            : "I can't answer right now — leave it in the support form on this page (/support).",
          source: 'fallback',
        });
      }
    },
  );
}

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';

/**
 * Vertex AI chat panel — Discord-style bubbles, typing indicator, full-text
 * responses (no streaming). One component serves both scopes:
 *  - 'assistant': general-purpose Vertex AI (PRO model for Netrex users)
 *  - 'support': app-questions channel (app-only system prompt, short answers)
 */

interface Bubble {
  role: 'user' | 'ai';
  text: string;
  error?: boolean;
}

interface VertexAIChatProps {
  scope: 'assistant' | 'support';
  title: string;
  subtitle?: string;
  onClose: () => void;
}

export function VertexAIChat({ scope, title, subtitle, onClose }: VertexAIChatProps) {
  const user = useAuthStore((s) => s.user);
  const isNetrex = !!(user?.netrexEnabled || (user as { netrexUntil?: number } | null)?.netrexUntil && (user as { netrexUntil?: number }).netrexUntil! > Date.now());

  const [bubbles, setBubbles] = useState<Bubble[]>([
    {
      role: 'ai',
      text: scope === 'support'
        ? '¡Hola! Pregúntame cómo funciona VERTEX: spaces, canales, tablero, Netrex…'
        : '¡Hola! Soy Vertex AI. ¿En qué te ayudo?',
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    api.ai.status().then((s) => setRemaining(s.remaining)).catch(() => setRemaining(null));
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [bubbles, sending]);

  const send = useCallback(async () => {
    const message = input.trim();
    if (!message || sending) return;
    setInput('');
    setBubbles((prev) => [...prev, { role: 'user', text: message }]);
    setSending(true);
    try {
      const result = scope === 'support' ? await api.ai.support(message) : await api.ai.chat(message);
      if (result.ok) {
        setBubbles((prev) => [...prev, { role: 'ai', text: result.text }]);
        setRemaining(result.remaining);
      } else {
        setBubbles((prev) => [...prev, { role: 'ai', text: (result as { message?: string }).message ?? 'No pude responder ahora mismo.', error: true }]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error de conexión';
      setBubbles((prev) => [...prev, { role: 'ai', text: msg, error: true }]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [input, sending, scope]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      className="fixed bottom-16 right-4 z-[190] w-[360px] max-w-[calc(100vw-2rem)] h-[480px] flex flex-col rounded-2xl border border-white/[0.08] bg-[#131318]/95 backdrop-blur-xl shadow-[0_24px_60px_-24px_rgba(0,0,0,0.8)] overflow-hidden"
      role="dialog"
      aria-label={title}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
        <span className="text-accent-primary text-[15px] leading-none">✦</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-bold text-txt-primary truncate">{title}</span>
            {isNetrex && (
              <span className="px-1.5 py-px rounded text-[8.5px] font-bold bg-accent-primary/15 text-accent-primary border border-accent-primary/30">NETREX</span>
            )}
          </div>
          {subtitle && <div className="text-[10px] text-txt-tertiary truncate">{subtitle}</div>}
        </div>
        <button onClick={onClose} className="w-6 h-6 rounded-md flex items-center justify-center text-txt-tertiary hover:text-txt-primary hover:bg-white/[0.06] transition-colors" aria-label="Close">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Bubbles */}
      <div ref={listRef} className="flex-1 overflow-y-auto scrollbar-thin px-3.5 py-3 space-y-2.5">
        {bubbles.map((b, i) => (
          <div key={i} className={`flex ${b.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] px-3 py-2 rounded-2xl text-[12.5px] leading-relaxed whitespace-pre-wrap break-words ${
                b.role === 'user'
                  ? 'bg-accent-primary text-white rounded-br-md'
                  : b.error
                    ? 'bg-red-500/10 border border-red-500/25 text-red-300 rounded-bl-md'
                    : 'bg-white/[0.06] border border-white/[0.05] text-txt-primary rounded-bl-md'
              }`}
            >
              {b.text}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="px-3 py-2.5 rounded-2xl rounded-bl-md bg-white/[0.06] border border-white/[0.05] flex items-center gap-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className="w-1.5 h-1.5 rounded-full bg-txt-tertiary animate-typing-pulse" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer: remaining + input */}
      <div className="px-3.5 pb-3 pt-1 border-t border-white/[0.05]">
        {remaining !== null && (
          <div className="text-[9.5px] text-txt-tertiary mb-1.5">
            {remaining} mensajes hoy
            {!isNetrex && (
              <span className="ml-1.5 px-1.5 py-px rounded bg-white/[0.05] text-txt-tertiary border border-white/[0.06]">Vertex AI básico — con Netrex usa el modelo avanzado</span>
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder={sending ? 'Vertex AI está escribiendo…' : 'Escribe un mensaje…'}
            disabled={sending || remaining === 0}
            className="flex-1 h-9 px-3 rounded-xl bg-white/[0.05] border border-white/[0.07] text-[12.5px] text-txt-primary placeholder:text-txt-tertiary/70 focus:outline-none focus:border-accent-primary/50 disabled:opacity-50"
          />
          <button
            onClick={() => void send()}
            disabled={sending || !input.trim() || remaining === 0}
            className="w-9 h-9 rounded-xl bg-accent-primary text-white flex items-center justify-center hover:bg-accent-primary/85 transition-colors disabled:opacity-40"
            aria-label="Send"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

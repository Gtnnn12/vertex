import { useState } from 'react';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { VertexAIChat } from './VertexAIChat';
import { SuggestionsSection } from './SuggestionsSection';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuthStore } from '../../stores/authStore';

/**
 * "VERTEX AI" sidebar section — assistant + app doubts + suggestions.
 *
 * Visual language matches the rest of the sidebar: uppercase category label
 * with letter-spacing, hairline separators (border-soft), theme-token colors
 * only (dark/light safe). The main button is a compact elevated card with an
 * accent-glow ✦; secondary rows are muted icon+text lines. The active panel
 * highlights its button like the active channel (accent 10% + accent icon).
 * Netrex users get the mini badge on the main card.
 */
export function VertexAIButtons() {
  const { t } = useLanguage();
  const [open, setOpen] = useState<'assistant' | 'support' | 'suggestions' | null>(null);
  const reducedMotion = useReducedMotion();
  const user = useAuthStore((s) => s.user);
  const isNetrex = !!(user?.netrexEnabled || (user as { netrexUntil?: number } | null)?.netrexUntil && (user as { netrexUntil?: number }).netrexUntil! > Date.now());

  const toggle = (scope: 'assistant' | 'support' | 'suggestions') =>
    setOpen((cur) => (cur === scope ? null : scope));

  const sectionLabel = 'text-[10px] font-bold uppercase tracking-[0.14em] text-txt-category px-1.5';

  // Secondary row: icon + text, quiet until hover; active = accent tint like
  // the active channel.
  const secondaryRow = (scope: 'support' | 'suggestions', icon: string, label: string) => {
    const active = open === scope;
    return (
      <button
        onClick={() => toggle(scope)}
        className={`ai-secondary-row w-full flex items-center gap-2 px-2.5 py-[5px] rounded-lg transition-colors ${
          active ? 'bg-accent-primary/10 text-accent-primary' : 'text-txt-tertiary hover:text-txt-secondary'
        }`}
        title={label}
      >
        <span className={`text-[10.5px] leading-none transition-colors ${active ? 'text-accent-primary' : 'text-txt-category group-hover/ai:text-accent-primary'}`}>
          {icon}
        </span>
        <span className="text-[11.5px] font-medium flex-1 text-left truncate">{label}</span>
      </button>
    );
  };

  return (
    <>
      <div className="group/ai flex flex-col px-1.5 pb-1 pt-0.5 gap-px select-none border-t border-b border-border-soft my-1 py-1.5">
        {/* Section label — same category style as CANALES / VOZ */}
        <span className={sectionLabel}>{t('vertex_ai_title')}</span>

        {/* Main card — ✦ assistant */}
        <button
          onClick={() => toggle('assistant')}
          className={`ai-main-card w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl border transition-all ${reducedMotion ? '' : 'hover:-translate-y-[2px]'} ${
            open === 'assistant'
              ? 'bg-accent-primary/10 border-accent-primary/35 shadow-[0_0_12px_-4px_rgb(var(--accent-primary-comma)/0.5)]'
              : 'bg-bg-elevated/60 border-border-soft hover:border-accent-primary/30 hover:shadow-[0_4px_14px_-6px_rgb(var(--accent-primary-comma)/0.45)]'
          }`}
          title={t('vertex_ai_title')}
        >
          <span
            className={`text-[14px] leading-none ${open === 'assistant' ? 'text-accent-primary' : 'text-txt-secondary'}`}
            style={open === 'assistant' || undefined ? undefined : { filter: 'saturate(0.9)' }}
          >
            ✦
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className={`block text-[12.5px] font-semibold leading-tight truncate ${open === 'assistant' ? 'text-accent-primary' : 'text-txt-primary'}`}>
              {t('vertex_ai_title')}
            </span>
            <span className="block text-[10px] text-txt-tertiary leading-tight truncate">{t('vertex_ai_subtitle_short')}</span>
          </span>
          {isNetrex && (
            <span className="flex-shrink-0 px-1.5 py-px rounded text-[8px] font-bold uppercase tracking-wide bg-accent-primary/15 text-accent-primary border border-accent-primary/30">
              Netrex
            </span>
          )}
        </button>

        {/* Secondary rows */}
        {secondaryRow('support', '?', t('vertex_ai_doubts'))}
        {secondaryRow('suggestions', '✎', t('suggestions_title'))}
      </div>

      {createPortal(
        <AnimatePresence>
          {open === 'assistant' && (
            <VertexAIChat
              scope="assistant"
              title={t('vertex_ai_title')}
              subtitle={t('vertex_ai_subtitle')}
              onClose={() => setOpen(null)}
            />
          )}
          {open === 'support' && (
            <VertexAIChat
              scope="support"
              title={t('vertex_ai_doubts')}
              subtitle={t('vertex_ai_doubts_subtitle')}
              onClose={() => setOpen(null)}
            />
          )}
          {open === 'suggestions' && (
            <motion.div
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
              animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
              transition={reducedMotion ? { duration: 0.15 } : { type: 'spring', stiffness: 320, damping: 28 }}
              className="fixed bottom-16 right-4 z-[190] w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border-soft bg-bg-elevated/95 backdrop-blur-xl shadow-[0_24px_60px_-24px_rgba(0,0,0,0.8)] overflow-hidden"
              role="dialog"
              aria-label={t('suggestions_title')}
            >
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border-soft bg-surface-chat/40">
                <span className="text-accent-primary text-[15px] leading-none">✎</span>
                <span className="text-[13px] font-bold text-txt-primary flex-1 truncate">{t('suggestions_title')}</span>
                <button onClick={() => setOpen(null)} className="w-6 h-6 rounded-md flex items-center justify-center text-txt-tertiary hover:text-txt-primary hover:bg-interactive-hover transition-colors" aria-label="Close">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-3.5">
                <SuggestionsSection />
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

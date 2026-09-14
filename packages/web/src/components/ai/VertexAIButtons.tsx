import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { VertexAIChat } from './VertexAIChat';
import { SuggestionsSection } from './SuggestionsSection';
import { useLanguage } from '../../contexts/LanguageContext';

/**
 * Sidebar buttons for the two Vertex AI surfaces (assistant + app doubts).
 * Rendered above the user panel in ChannelSidebar; panels are portaled so
 * they escape any sidebar overflow.
 */
export function VertexAIButtons() {
  const { t } = useLanguage();
  const [open, setOpen] = useState<'assistant' | 'support' | 'suggestions' | null>(null);

  const toggle = (scope: 'assistant' | 'support' | 'suggestions') =>
    setOpen((cur) => (cur === scope ? null : scope));

  return (
    <>
      <div className="flex flex-col px-1.5 pb-1 gap-0.5 select-none">
        <button
          onClick={() => toggle('assistant')}
          className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[9px] transition-colors ${
            open === 'assistant' ? 'bg-accent-primary/12 text-accent-primary' : 'text-txt-secondary hover:bg-white/[0.04] hover:text-txt-primary'
          }`}
          title={t('vertex_ai_title')}
        >
          <span className="text-[13px] leading-none">✦</span>
          <span className="text-[12.5px] font-semibold flex-1 text-left truncate">{t('vertex_ai_title')}</span>
        </button>
        <button
          onClick={() => toggle('support')}
          className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[9px] transition-colors ${
            open === 'support' ? 'bg-accent-primary/12 text-accent-primary' : 'text-txt-tertiary hover:bg-white/[0.04] hover:text-txt-secondary'
          }`}
          title={t('vertex_ai_doubts')}
        >
          <span className="text-[11px] leading-none opacity-80">?</span>
          <span className="text-[12px] flex-1 text-left truncate">{t('vertex_ai_doubts')}</span>
        </button>
        <button
          onClick={() => toggle('suggestions')}
          className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[9px] transition-colors ${
            open === 'suggestions' ? 'bg-accent-primary/12 text-accent-primary' : 'text-txt-tertiary hover:bg-white/[0.04] hover:text-txt-secondary'
          }`}
          title={t('suggestions_title')}
        >
          <span className="text-[11px] leading-none opacity-80">✎</span>
          <span className="text-[12px] flex-1 text-left truncate">{t('suggestions_title')}</span>
        </button>
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
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="fixed bottom-16 right-4 z-[190] w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-white/[0.08] bg-[#131318]/95 backdrop-blur-xl shadow-[0_24px_60px_-24px_rgba(0,0,0,0.8)] overflow-hidden"
              role="dialog"
              aria-label={t('suggestions_title')}
            >
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
                <span className="text-accent-primary text-[15px] leading-none">✎</span>
                <span className="text-[13px] font-bold text-txt-primary flex-1 truncate">{t('suggestions_title')}</span>
                <button onClick={() => setOpen(null)} className="w-6 h-6 rounded-md flex items-center justify-center text-txt-tertiary hover:text-txt-primary hover:bg-white/[0.06] transition-colors" aria-label="Close">
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

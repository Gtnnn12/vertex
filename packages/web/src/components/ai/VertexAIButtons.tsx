import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { VertexAIChat } from './VertexAIChat';
import { useLanguage } from '../../contexts/LanguageContext';

/**
 * Sidebar buttons for the two Vertex AI surfaces (assistant + app doubts).
 * Rendered above the user panel in ChannelSidebar; panels are portaled so
 * they escape any sidebar overflow.
 */
export function VertexAIButtons() {
  const { t } = useLanguage();
  const [open, setOpen] = useState<'assistant' | 'support' | null>(null);

  const toggle = (scope: 'assistant' | 'support') => setOpen((cur) => (cur === scope ? null : scope));

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
      </div>

      {createPortal(
        <AnimatePresence>
          {open && (
            <VertexAIChat
              key={open}
              scope={open}
              title={open === 'assistant' ? t('vertex_ai_title') : t('vertex_ai_doubts')}
              subtitle={open === 'assistant' ? t('vertex_ai_subtitle') : t('vertex_ai_doubts_subtitle')}
              onClose={() => setOpen(null)}
            />
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

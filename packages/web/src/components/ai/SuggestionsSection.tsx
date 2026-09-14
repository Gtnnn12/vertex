import { useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../../api/client';
import { useLanguage } from '../../contexts/LanguageContext';

/**
 * "Sugerencias" — a simple proposal form. The user writes an improvement
 * idea for VERTEX; it lands in the Admin Center queue (status: 'pending').
 */
export function SuggestionsSection() {
  const { t } = useLanguage();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    setError(null);
    try {
      await api.suggestions.create(value);
      setText('');
      setSent(true);
      setTimeout(() => setSent(false), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[13px] font-bold text-txt-primary">✦ {t('suggestions_title')}</span>
      </div>
      <p className="text-[11px] text-txt-tertiary mb-3">{t('suggestions_subtitle')}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={2000}
        rows={3}
        placeholder={t('suggestions_placeholder')}
        className="w-full resize-none rounded-lg bg-white/[0.04] border border-white/[0.07] px-3 py-2 text-[12.5px] text-txt-primary placeholder:text-txt-tertiary/70 focus:outline-none focus:border-accent-primary/50"
      />
      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] text-txt-tertiary">{text.length}/2000</span>
        <div className="flex items-center gap-2">
          {sent && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[11px] text-green-400">
              {t('suggestions_thanks')}
            </motion.span>
          )}
          {error && <span className="text-[11px] text-red-400">{error}</span>}
          <button
            onClick={() => void submit()}
            disabled={sending || !text.trim()}
            className="px-3 py-1.5 rounded-lg bg-accent-primary text-white text-[12px] font-semibold hover:bg-accent-primary/85 transition-colors disabled:opacity-40"
          >
            {sending ? '…' : t('suggestions_send')}
          </button>
        </div>
      </div>
    </div>
  );
}

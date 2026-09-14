import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useLanguage } from '../../contexts/LanguageContext';
import type { UserSuggestion } from '@backspace/shared';

/**
 * Admin Center — "Sugerencias" tab: every user-submitted proposal with
 * simple triage actions (marcar leída / aprobar / rechazar). No voting,
 * no complexity — a queue.
 */

const STATUS_STYLES: Record<UserSuggestion['status'], string> = {
  pending: 'bg-amber-400/10 text-amber-300 border-amber-400/30',
  read: 'bg-sky-400/10 text-sky-300 border-sky-400/30',
  approved: 'bg-green-400/10 text-green-300 border-green-400/30',
  rejected: 'bg-red-400/10 text-red-300 border-red-400/30',
};

export function AdminSuggestions() {
  const { t } = useLanguage();
  const [suggestions, setSuggestions] = useState<UserSuggestion[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    api.suggestions.list().then((r) => setSuggestions(r.suggestions)).catch(() => setSuggestions([]));
  };

  useEffect(load, []);

  const setStatus = async (id: string, status: 'read' | 'approved' | 'rejected') => {
    setBusyId(id);
    try {
      const { suggestion } = await api.suggestions.updateStatus(id, status);
      setSuggestions((prev) => prev?.map((s) => (s.id === id ? suggestion : s)) ?? prev);
    } finally {
      setBusyId(null);
    }
  };

  if (suggestions === null) {
    return <div className="text-sm text-txt-tertiary py-6">…</div>;
  }

  if (suggestions.length === 0) {
    return <div className="text-sm text-txt-tertiary py-6">{t('suggestions_empty')}</div>;
  }

  return (
    <div className="space-y-2">
      {suggestions.map((s) => (
        <div key={s.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-[12.5px] font-semibold text-txt-primary">{s.username ?? s.userId.slice(0, 8)}</span>
            <span className="text-[10.5px] text-txt-tertiary">{new Date(s.createdAt).toLocaleString()}</span>
            <span className={`ml-auto px-1.5 py-px rounded border text-[9px] font-bold uppercase tracking-wide ${STATUS_STYLES[s.status]}`}>
              {s.status}
            </span>
          </div>
          <p className="text-[12.5px] text-txt-secondary whitespace-pre-wrap break-words leading-relaxed">{s.text}</p>
          <div className="flex items-center gap-1.5 mt-2.5">
            {s.status === 'pending' && (
              <button
                onClick={() => void setStatus(s.id, 'read')}
                disabled={busyId === s.id}
                className="px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[11px] text-txt-secondary hover:bg-white/[0.08] transition-colors disabled:opacity-40"
              >
                Marcar leída
              </button>
            )}
            {s.status !== 'approved' && (
              <button
                onClick={() => void setStatus(s.id, 'approved')}
                disabled={busyId === s.id}
                className="px-2.5 py-1 rounded-lg bg-green-500/10 border border-green-500/25 text-[11px] text-green-300 hover:bg-green-500/15 transition-colors disabled:opacity-40"
              >
                Aprobar
              </button>
            )}
            {s.status !== 'rejected' && (
              <button
                onClick={() => void setStatus(s.id, 'rejected')}
                disabled={busyId === s.id}
                className="px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/25 text-[11px] text-red-300 hover:bg-red-500/15 transition-colors disabled:opacity-40"
              >
                Rechazar
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

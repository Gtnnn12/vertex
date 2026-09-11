import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useLanguage } from '../../contexts/LanguageContext';
import { useUIStore } from '../../stores/uiStore';
import { Avatar } from '../ui/Avatar';
import { EmptyHint, ErrorBanner, LoadingHint, formatDateTime } from './adminShared';
import { AdminUserDetail } from './AdminUserDetail';
import type { AdminCenterUserRow, AdminCenterViewerCapabilities, AuditLogEntry } from '@backspace/shared';

export function AdminModeration({ viewer }: { viewer: AdminCenterViewerCapabilities }) {
  const { t, language } = useLanguage();
  const addToast = useUIStore((s) => s.addToast);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [results, setResults] = useState<AdminCenterUserRow[]>([]);
  const [selected, setSelected] = useState<AdminCenterUserRow | null>(null);
  const [searchError, setSearchError] = useState('');

  const [recent, setRecent] = useState<AuditLogEntry[]>([]);
  const [recentError, setRecentError] = useState('');

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQ(q), 300);
    return () => window.clearTimeout(id);
  }, [q]);

  const search = useCallback(async () => {
    if (!debouncedQ.trim()) return setResults([]);
    setSearchError('');
    try {
      const res = await api.adminCenter.users({ q: debouncedQ.trim(), filter: 'all', pageSize: 8 });
      setResults(res.users);
    } catch {
      setSearchError(t('admin_error_load'));
    }
  }, [debouncedQ, t]);

  useEffect(() => {
    search();
  }, [search]);

  const loadRecent = useCallback(async () => {
    setRecentError('');
    try {
      const res = await api.adminCenter.auditLog({ q: 'moderation_%', pageSize: 20 });
      setRecent(res.entries);
    } catch {
      setRecentError(t('admin_error_load'));
    }
  }, [t]);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-txt-primary">{t('admin_moderation')}</h2>
        <div className="text-xs text-txt-tertiary mt-0.5">{t('admin_moderation_sub')}</div>
      </div>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('admin_search_username')} className="input-search text-xs py-1 w-full" />
      {searchError && <ErrorBanner message={searchError} />}

      {results.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {results.map((u) => (
            <button key={u.id} onClick={() => setSelected(u)} className={`flex items-center gap-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] p-3 text-left transition-colors ${selected?.id === u.id ? 'border-accent-primary/40' : ''}`}>
              <Avatar src={u.avatar ? api.uploads.url(u.avatar) : null} name={u.displayName || u.username} size={32} avatarColor={u.avatarColor as never} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-txt-primary truncate">{u.username}</div>
                <div className="text-xs text-txt-tertiary mt-0.5">
                  {u.bannedUntil ? `${t('admin_banned')} · ${u.banReason ?? ''}` : t('admin_not_banned')}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="border-t border-white/[0.06] pt-4">
          <AdminUserDetail
            key={selected.id}
            userId={selected.id}
            viewer={viewer}
            onToast={(msg, type = 'success') => addToast(msg, type, 3000)}
            onChanged={() => {
              search();
              loadRecent();
            }}
          />
        </div>
      )}

      <div className="border-t border-white/[0.06] pt-4">
        <h3 className="text-sm font-semibold text-txt-primary mb-2">{t('admin_recent_mod_actions')}</h3>
        {recentError && <ErrorBanner message={recentError} />}
        {!recentError && recent.length === 0 && <EmptyHint label={t('admin_no_entries')} />}
        <div className="space-y-1.5">
          {recent.map((entry) => (
            <div key={entry.id} className="flex items-start gap-2 text-xs">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-accent-sky/20 text-accent-sky flex-shrink-0">
                {entry.action.replace('moderation_', '')}
              </span>
              <div className="min-w-0 text-txt-secondary">
                <span className="text-txt-primary">{entry.actorUsername ?? entry.actorId}</span> → {entry.targetId} · {formatDateTime(entry.createdAt, language)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
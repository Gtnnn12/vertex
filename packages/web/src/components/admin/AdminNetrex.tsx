import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useLanguage } from '../../contexts/LanguageContext';
import { useUIStore } from '../../stores/uiStore';
import { Avatar } from '../ui/Avatar';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyHint, ErrorBanner, LoadingHint, PaginationRow, SelectInput, formatRelative } from './adminShared';
import type { AdminCenterUserRow } from '@vertex/shared';

const PAGE_SIZE = 12;

export function AdminNetrex({ canManage }: { canManage: boolean }) {
  const { t, language } = useLanguage();
  const addToast = useUIStore((s) => s.addToast);

  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ users: AdminCenterUserRow[]; total: number } | null>(null);
  const [error, setError] = useState('');

  const [grantTo, setGrantTo] = useState<AdminCenterUserRow | null>(null);
  const [grantSearch, setGrantSearch] = useState('');
  const [grantResults, setGrantResults] = useState<AdminCenterUserRow[]>([]);
  const [grantSel, setGrantSel] = useState('1440');
  const [grantCustom, setGrantCustom] = useState('');
  const [revoke, setRevoke] = useState<AdminCenterUserRow | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQ(q), 300);
    return () => window.clearTimeout(id);
  }, [q]);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await api.adminCenter.netrex({ q: debouncedQ || undefined, filter, page, pageSize: PAGE_SIZE });
      setData({ users: res.users, total: res.total });
    } catch {
      setError(t('admin_error_load'));
    }
  }, [debouncedQ, filter, page, t]);

  useEffect(() => {
    load();
  }, [load]);

  const grantPresets: { label: string; minutes: number | null }[] = [
    { label: '1h', minutes: 60 },
    { label: '1d', minutes: 1440 },
    { label: '3d', minutes: 4320 },
    { label: '7d', minutes: 10080 },
    { label: '14d', minutes: 20160 },
    { label: '30d', minutes: 43200 },
    { label: '90d', minutes: 129600 },
    { label: 'admin_permanent', minutes: null },
  ];

  const runGrant = async () => {
    if (!grantTo) return;
    let permanent = false;
    let durationMinutes: number | undefined;
    if (grantSel === 'admin_permanent') {
      permanent = true;
    } else {
      durationMinutes = Number(grantSel);
      if (grantSel === 'custom') {
        const days = Number(grantCustom);
        if (!days || days <= 0) {
          addToast(t('admin_invalid_duration'), 'warning', 3000);
          return;
        }
        durationMinutes = days * 1440;
      }
    }
    try {
      await api.adminCenter.grantNetrex(grantTo.id, permanent ? { permanent: true } : { durationMinutes });
      addToast(t('admin_grant_success'), 'success', 3000);
      setGrantTo(null);
      setGrantSearch('');
      setGrantResults([]);
      load();
    } catch {
      addToast(t('admin_error_action'), 'warning', 3000);
    }
  };

  const runRevoke = async () => {
    if (!revoke) return;
    try {
      await api.adminCenter.revokeNetrex(revoke.id);
      addToast(t('admin_revoke_success'), 'success', 3000);
      setRevoke(null);
      load();
    } catch {
      addToast(t('admin_error_action'), 'warning', 3000);
    }
  };

  const searchGrantTarget = async (term: string) => {
    setGrantSearch(term);
    if (!term.trim()) return setGrantResults([]);
    try {
      const res = await api.adminCenter.users({ q: term.trim(), filter: 'all', pageSize: 8 });
      setGrantResults(res.users.filter((u) => !u.homeInstance && !u.isDeleted));
    } catch {
      setGrantResults([]);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-txt-primary">{t('admin_netrex')}</h2>
        <div className="text-xs text-txt-tertiary mt-0.5">{t('admin_netrex_sub')}</div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={t('admin_search_username')} className="input-search text-xs py-1 min-w-[160px] flex-1" />
        <SelectInput value={filter} onChange={(v) => { setFilter(v); setPage(1); }} className="min-w-[130px]">
          <option value="all">{t('admin_filter_all')}</option>
          <option value="active">{t('admin_filter_active')}</option>
          <option value="permanent">{t('admin_filter_permanent')}</option>
          <option value="expired">{t('admin_filter_expired')}</option>
        </SelectInput>
      </div>

      <ErrorBanner message={error} />
      {!data && !error && <LoadingHint label={t('admin_loading')} />}

      {data && (
        <div className="flex flex-col gap-1.5">
          {data.users.length === 0 && <EmptyHint label={t('admin_no_users')} />}
          {data.users.map((user) => (
            <div key={user.id} className="flex items-center gap-3 rounded-lg bg-white/[0.02] border border-white/[0.04] p-3">
              <Avatar src={user.avatar ? api.uploads.url(user.avatar) : null} name={user.displayName || user.username} size={32} avatarColor={user.avatarColor as never} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-txt-primary truncate">{user.username}</div>
                <div className="text-xs text-txt-tertiary mt-0.5">
                  {user.netrexState === 'permanent' && t('admin_netrex_permanent_active')}
                  {user.netrexState === 'active' && user.netrexExpiresAt && `${t('admin_expires')} ${formatRelative(user.netrexExpiresAt, language)}`}
                  {user.netrexState === 'expired' && t('admin_netrex_expired_desc')}
                </div>
              </div>
              {canManage && (
                <button onClick={() => setRevoke(user)} className="px-2.5 py-1 text-xs rounded bg-accent-rose/15 hover:bg-accent-rose/25 text-accent-rose transition-colors">
                  {t('admin_revoke')}
                </button>
              )}
            </div>
          ))}
          <PaginationRow page={page} total={data.total} pageSize={PAGE_SIZE} onPage={(p) => { setPage(p); load(); }} countLabel={String(data.total)} />
        </div>
      )}

      {canManage && (
        <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-3.5 space-y-2">
          <h3 className="text-sm font-semibold text-txt-primary">{t('admin_grant_netrex_title')}</h3>
          {!grantTo ? (
            <>
              <input value={grantSearch} onChange={(e) => searchGrantTarget(e.target.value)} placeholder={t('admin_search_username')} className="input-search text-xs py-1 w-full" />
              {grantResults.length > 0 && (
                <div className="space-y-1">
                  {grantResults.map((u) => (
                    <button key={u.id} onClick={() => setGrantTo(u)} className="flex items-center gap-2 w-full p-2 rounded bg-white/[0.03] hover:bg-white/[0.06] transition-colors">
                      <Avatar src={u.avatar ? api.uploads.url(u.avatar) : null} name={u.displayName || u.username} size={24} avatarColor={u.avatarColor as never} />
                      <span className="text-sm text-txt-primary">{u.username}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm text-txt-primary">
                <Avatar src={grantTo.avatar ? api.uploads.url(grantTo.avatar) : null} name={grantTo.displayName || grantTo.username} size={24} avatarColor={grantTo.avatarColor as never} />
                {grantTo.username}
                <button onClick={() => { setGrantTo(null); setGrantResults([]); }} className="ml-auto text-xs text-txt-tertiary hover:text-txt-primary">{t('admin_change')}</button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {grantPresets.map((p) => (
                  <button key={p.label} onClick={() => setGrantSel(p.minutes === null ? 'admin_permanent' : String(p.minutes))} className={`px-2.5 py-1 text-xs rounded transition-colors ${grantSel === (p.minutes === null ? 'admin_permanent' : String(p.minutes)) ? 'bg-accent-coral/25 text-accent-coral' : 'bg-white/[0.05] text-txt-secondary hover:bg-white/[0.09]'}`}>
                    {p.minutes === null ? t('admin_permanent') : p.label}
                  </button>
                ))}
                <button onClick={() => setGrantSel('custom')} className={`px-2.5 py-1 text-xs rounded transition-colors ${grantSel === 'custom' ? 'bg-accent-coral/25 text-accent-coral' : 'bg-white/[0.05] text-txt-secondary hover:bg-white/[0.09]'}`}>
                  {t('admin_custom')}
                </button>
                {grantSel === 'custom' && (
                  <div className="flex items-center gap-1">
                    <input value={grantCustom} onChange={(e) => setGrantCustom(e.target.value)} placeholder={t('admin_days')} className="input-search text-xs py-1 w-16" />
                    <span className="text-[10px] text-txt-tertiary">{t('admin_days_short')}</span>
                  </div>
                )}
                <button onClick={runGrant} className="px-3 py-1 text-xs font-medium rounded bg-accent-coral/25 hover:bg-accent-coral/35 text-accent-coral transition-colors">
                  {t('admin_grant')}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {revoke && (
        <ConfirmDialog
          isOpen
          onClose={() => setRevoke(null)}
          onConfirm={runRevoke}
          title={t('admin_revoke_netrex_title')}
          description={t('admin_revoke_netrex_body')}
          confirmLabel={t('admin_confirm')}
          cancelLabel={t('admin_cancel')}
          variant="danger"
        />
      )}
    </div>
  );
}
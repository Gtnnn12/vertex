import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useLanguage } from '../../contexts/LanguageContext';
import { useUIStore } from '../../stores/uiStore';
import { Avatar } from '../ui/Avatar';
import { StaffBadge } from '../ui/StaffBadge';
import { ErrorBanner, LoadingHint, EmptyHint, PaginationRow, SelectInput } from './adminShared';
import { AdminUserDetail } from './AdminUserDetail';
import type { AdminCenterUserRow, AdminCenterViewerCapabilities } from '@vertex/shared';

const PAGE_SIZE = 12;

export function AdminUsers({ viewer }: { viewer: AdminCenterViewerCapabilities }) {
  const { t } = useLanguage();
  const addToast = useUIStore((s) => s.addToast);

  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [presence, setPresence] = useState('any');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ users: AdminCenterUserRow[]; total: number } | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<AdminCenterUserRow | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQ(q), 300);
    return () => window.clearTimeout(id);
  }, [q]);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await api.adminCenter.users({
        q: debouncedQ || undefined,
        filter,
        presence: presence === 'any' ? undefined : presence,
        sort,
        page,
        pageSize: PAGE_SIZE,
      });
      setData({ users: res.users, total: res.total });
      setSelected(null);
    } catch {
      setError(t('admin_error_load'));
    }
  }, [debouncedQ, filter, presence, sort, page, t]);

  useEffect(() => {
    load();
  }, [load]);

  const resetAndPick = (user: AdminCenterUserRow) => {
    setSelected(user);
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-txt-primary">{t('admin_users')}</h2>
        <div className="text-xs text-txt-tertiary mt-0.5">{t('admin_users_sub')}</div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder={t('admin_search_username')}
          className="input-search text-xs py-1 min-w-[160px] flex-1"
        />
        <SelectInput value={filter} onChange={(v) => { setFilter(v); setPage(1); }} className="min-w-[120px]">
          <option value="all">{t('admin_filter_all')}</option>
          <option value="deleted">{t('admin_filter_deleted')}</option>
          <option value="netrex">{t('admin_filter_netrex')}</option>
          <option value="expired">{t('admin_filter_expired')}</option>
          <option value="no-netrex">{t('admin_filter_no_netrex')}</option>
          <option value="staff">{t('admin_filter_staff')}</option>
          <option value="no-staff">{t('admin_filter_no_staff')}</option>
          <option value="banned">{t('admin_filter_banned')}</option>
          <option value="not-banned">{t('admin_filter_not_banned')}</option>
        </SelectInput>
        <SelectInput value={presence} onChange={(v) => { setPresence(v); setPage(1); }} className="min-w-[110px]">
          <option value="any">{t('admin_presence_any')}</option>
          <option value="online">{t('admin_presence_online')}</option>
          <option value="offline">{t('admin_presence_offline')}</option>
        </SelectInput>
        <SelectInput value={sort} onChange={(v) => { setSort(v); setPage(1); }} className="min-w-[110px]">
          <option value="newest">{t('admin_sort_newest')}</option>
          <option value="oldest">{t('admin_sort_oldest')}</option>
          <option value="az">{t('admin_sort_az')}</option>
          <option value="za">{t('admin_sort_za')}</option>
          <option value="lastActive">{t('admin_sort_last_active')}</option>
        </SelectInput>
      </div>

      <ErrorBanner message={error} />
      {!data && !error && <LoadingHint label={t('admin_loading')} />}

      {data && (
        <div className="flex flex-col gap-1.5">
          {data.users.length === 0 && <EmptyHint label={t('admin_no_users')} />}
          {data.users.map((user) => {
            const isDeleted = user.isDeleted;
            const isFederated = !!user.homeInstance;
            return (
              <button
                key={user.id}
                onClick={() => resetAndPick(user)}
                className={`flex items-center gap-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] p-3 text-left transition-colors ${selected?.id === user.id ? 'border-accent-primary/40' : ''}`}
              >
                <div className={isDeleted ? 'opacity-50' : ''}>
                  <Avatar
                    src={user.avatar ? api.uploads.url(user.avatar) : null}
                    name={user.displayName || user.username}
                    size={32}
                    avatarColor={user.avatarColor as never}
                  />
                </div>
                <div className={`flex-1 min-w-0 ${isDeleted ? 'opacity-50' : ''}`}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-sm font-medium text-txt-primary truncate ${isDeleted ? 'line-through' : ''}`}>
                      {user.username}
                    </span>
                    <StaffBadge role={user.staffRole} />
                    {user.netrexState !== 'none' && (
                      <span className="px-1.5 py-0.5 text-[9.5px] font-bold rounded uppercase tracking-wide bg-accent-coral/20 text-accent-coral">
                        Netrex
                      </span>
                    )}
                    {user.isAdmin && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-accent-amber/20 text-accent-amber">
                        {t('admin_legacy_admin')}
                      </span>
                    )}
                    {user.bannedUntil && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-accent-rose/20 text-accent-rose">
                        {t('admin_banned')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-xs text-txt-tertiary">
                    {user.displayName && user.displayName !== user.username && <span className="truncate">{user.displayName}</span>}
                    {isFederated && <span className="truncate max-w-[140px]">{user.homeInstance}</span>}
                    <span>·</span>
                    <span>{t('admin_joined')} {new Date(user.createdAt).getFullYear()}</span>
                  </div>
                </div>
              </button>
            );
          })}
          <PaginationRow
            page={page}
            total={data.total}
            pageSize={PAGE_SIZE}
            onPage={(p) => {
              setPage(p);
              load();
            }}
            countLabel={String(data.total)}
          />
        </div>
      )}

      {selected && (
        <div className="mt-4 border-t border-white/[0.06] pt-4">
          <AdminUserDetail
            key={selected.id}
            userId={selected.id}
            viewer={viewer}
            onToast={(msg, type = 'success') => addToast(msg, type, 3000)}
            onChanged={() => load()}
          />
        </div>
      )}
    </div>
  );
}
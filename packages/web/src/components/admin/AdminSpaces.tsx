import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useLanguage } from '../../contexts/LanguageContext';
import { Avatar } from '../ui/Avatar';
import { Card, EmptyHint, ErrorBanner, LoadingHint, PaginationRow, SelectInput, formatDateTime } from './adminShared';
import type { AdminCenterSpaceDetail, AdminCenterSpaceRow } from '@vertex/shared';

const PAGE_SIZE = 12;

export function AdminSpaces() {
  const { t, language } = useLanguage();
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [sort, setSort] = useState('popular');
  const [visibility, setVisibility] = useState('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ spaces: AdminCenterSpaceRow[]; total: number } | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<AdminCenterSpaceRow | null>(null);
  const [detail, setDetail] = useState<AdminCenterSpaceDetail | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQ(q), 300);
    return () => window.clearTimeout(id);
  }, [q]);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await api.adminCenter.spaces({
        q: debouncedQ || undefined,
        sort,
        visibility: visibility === 'all' ? undefined : visibility,
        page,
        pageSize: PAGE_SIZE,
      });
      setData({ spaces: res.spaces, total: res.total });
    } catch {
      setError(t('admin_error_load'));
    }
  }, [debouncedQ, sort, visibility, page, t]);

  useEffect(() => {
    load();
  }, [load]);

  const pick = async (space: AdminCenterSpaceRow) => {
    setSelected(space);
    try {
      const d = await api.adminCenter.spaceDetail(space.id);
      setDetail(d);
    } catch {
      setDetail(null);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-txt-primary">{t('admin_spaces')}</h2>
        <div className="text-xs text-txt-tertiary mt-0.5">{t('admin_spaces_sub')}</div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={t('admin_search_space')} className="input-search text-xs py-1 min-w-[160px] flex-1" />
        <SelectInput value={sort} onChange={(v) => { setSort(v); setPage(1); }} className="min-w-[110px]">
          <option value="popular">{t('admin_sort_popular')}</option>
          <option value="newest">{t('admin_sort_newest')}</option>
          <option value="oldest">{t('admin_sort_oldest')}</option>
          <option value="az">{t('admin_sort_az')}</option>
        </SelectInput>
        <SelectInput value={visibility} onChange={(v) => { setVisibility(v); setPage(1); }} className="min-w-[110px]">
          <option value="all">{t('admin_filter_all')}</option>
          <option value="public">{t('admin_vis_public')}</option>
          <option value="request">{t('admin_vis_request')}</option>
          <option value="private">{t('admin_vis_private')}</option>
        </SelectInput>
      </div>

      <ErrorBanner message={error} />
      {!data && !error && <LoadingHint label={t('admin_loading')} />}

      {data && (
        <div className="flex flex-col gap-1.5">
          {data.spaces.length === 0 && <EmptyHint label={t('admin_no_spaces')} />}
          {data.spaces.map((space) => (
            <button key={space.id} onClick={() => pick(space)} className={`flex items-center gap-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] p-3 text-left transition-colors ${selected?.id === space.id ? 'border-accent-primary/40' : ''}`}>
              <Avatar src={space.icon ? api.uploads.url(space.icon) : null} name={space.name} size={32} avatarColor={space.avatarColor as never} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-medium text-txt-primary truncate">{space.name}</span>
                  <span className="px-1.5 py-0.5 text-[9.5px] font-semibold uppercase rounded bg-white/[0.06] text-txt-secondary">{t(`admin_vis_${space.visibility}`)}</span>
                </div>
                <div className="text-xs text-txt-tertiary mt-0.5">
                  {t('admin_members')}: {space.memberCount} · {t('admin_owner')}: {space.ownerUsername}
                </div>
              </div>
            </button>
          ))}
          <PaginationRow page={page} total={data.total} pageSize={PAGE_SIZE} onPage={(p) => { setPage(p); load(); }} countLabel={String(data.total)} />
        </div>
      )}

      {selected && detail && (
        <Card className="border-t border-white/[0.06]">
          <div className="flex items-center gap-3 mb-2">
            <Avatar src={detail.icon ? api.uploads.url(detail.icon) : null} name={detail.name} size={36} avatarColor={detail.avatarColor as never} />
            <div>
              <h3 className="text-sm font-semibold text-txt-primary">{detail.name}</h3>
              <div className="text-xs text-txt-tertiary">{t(`admin_vis_${detail.visibility}`)} · {t('admin_owner')}: {detail.ownerUsername}</div>
            </div>
          </div>
          {detail.description && <div className="text-xs text-txt-secondary mb-2">{detail.description}</div>}
          <div className="grid grid-cols-2 gap-2 text-xs text-txt-secondary">
            <div className="rounded bg-white/[0.03] p-2"><span className="text-txt-primary font-semibold">{detail.memberCount}</span> {t('admin_members')}</div>
            <div className="rounded bg-white/[0.03] p-2"><span className="text-txt-primary font-semibold">{detail.channelCount}</span> {t('admin_channels')}</div>
            <div className="rounded bg-white/[0.03] p-2"><span className="text-txt-primary font-semibold">{detail.pendingJoinRequests}</span> {t('admin_pending_requests')}</div>
            <div className="rounded bg-white/[0.03] p-2"><span className="text-txt-primary font-semibold">{detail.bannedMembers}</span> {t('admin_banned')}</div>
          </div>
          <div className="text-xs text-txt-tertiary mt-2">{t('admin_created')} {formatDateTime(detail.createdAt, language)}</div>
        </Card>
      )}
    </div>
  );
}
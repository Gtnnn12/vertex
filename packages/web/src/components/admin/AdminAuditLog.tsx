import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useLanguage } from '../../contexts/LanguageContext';
import { EmptyHint, ErrorBanner, LoadingHint, PaginationRow, formatDateTime } from './adminShared';
import type { AuditLogEntry } from '@vertex/shared';

const PAGE_SIZE = 20;

export function AdminAuditLog() {
  const { t, language } = useLanguage();
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ entries: AuditLogEntry[]; total: number } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await api.adminCenter.auditLog({
        q: q || undefined,
        action: action || undefined,
        actor: actor || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setData({ entries: res.entries, total: res.total });
    } catch {
      setError(t('admin_error_load'));
    }
  }, [q, action, actor, page, t]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-txt-primary">{t('admin_audit')}</h2>
        <div className="text-xs text-txt-tertiary mt-0.5">{t('admin_audit_sub')}</div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={t('admin_audit_search')} className="input-search text-xs py-1 min-w-[140px] flex-1" />
        <input value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} placeholder={t('admin_audit_action')} className="input-search text-xs py-1 min-w-[110px]" />
        <input value={actor} onChange={(e) => { setActor(e.target.value); setPage(1); }} placeholder={t('admin_audit_actor')} className="input-search text-xs py-1 min-w-[110px]" />
      </div>

      <ErrorBanner message={error} />
      {!data && !error && <LoadingHint label={t('admin_loading')} />}

      {data && (
        <>
          {data.entries.length === 0 && <EmptyHint label={t('admin_no_entries')} />}
          <div className="overflow-x-auto rounded-lg bg-white/[0.02] border border-white/[0.04]">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-txt-tertiary border-b border-white/[0.06]">
                  <th className="px-3 py-2 font-medium">{t('admin_col_when')}</th>
                  <th className="px-3 py-2 font-medium">{t('admin_col_actor')}</th>
                  <th className="px-3 py-2 font-medium">{t('admin_col_action')}</th>
                  <th className="px-3 py-2 font-medium">{t('admin_col_target')}</th>
                  <th className="px-3 py-2 font-medium">{t('admin_col_meta')}</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-white/[0.03] last:border-0 align-top">
                    <td className="px-3 py-2 whitespace-nowrap text-txt-tertiary">{formatDateTime(entry.createdAt, language)}</td>
                    <td className="px-3 py-2 text-txt-primary whitespace-nowrap">{entry.actorUsername ?? entry.actorId}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-white/[0.06] text-txt-secondary">{entry.action}</span>
                    </td>
                    <td className="px-3 py-2 text-txt-secondary whitespace-nowrap">{entry.targetType ? `${entry.targetType}` : ''}{entry.targetId ? ` (${entry.targetId.slice(0, 8)}…)` : '—'}</td>
                    <td className="px-3 py-2 text-txt-tertiary truncate max-w-[220px]">{entry.metadata ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationRow page={page} total={data.total} pageSize={PAGE_SIZE} onPage={(p) => { setPage(p); load(); }} countLabel={String(data.total)} />
        </>
      )}
    </div>
  );
}
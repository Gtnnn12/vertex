import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useLanguage } from '../../contexts/LanguageContext';
import { Avatar } from '../ui/Avatar';
import { EmptyHint, ErrorBanner, LoadingHint, formatRelative } from './adminShared';
import type { AdminCenterActivityResponse, AdminCenterActivityRow } from '@vertex/shared';

function ActivityUser({ u, status, lang }: { u: AdminCenterActivityRow; status: string; lang: 'es' | 'en' }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-white/[0.02] border border-white/[0.04] p-3">
      <div className="relative">
        <Avatar
          src={u.avatar ? api.uploads.url(u.avatar) : null}
          name={u.displayName || u.username}
          size={32}
          avatarColor={u.avatarColor as never}
        />
        {u.isOnline && <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-accent-mint border-2 border-bg-surface-200" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-txt-primary truncate">{u.displayName || u.username}</div>
        <div className="text-xs text-txt-tertiary mt-0.5">{status}</div>
      </div>
    </div>
  );
}

function UserList({ rows, label, lang, statusWhenOffline }: { rows: AdminCenterActivityRow[]; label: string; lang: 'es' | 'en'; statusWhenOffline: (u: AdminCenterActivityRow) => string }) {
  const t = useLanguage().t;
  return (
    <div>
      <h3 className="text-sm font-semibold text-txt-primary mb-1.5">
        {label} ({rows.length})
      </h3>
      {rows.length === 0 ? (
        <EmptyHint label={t('admin_no_users')} />
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map((u) => (
            <ActivityUser key={u.userId} u={u} status={u.isOnline ? t('admin_status_online') : statusWhenOffline(u)} lang={lang} />
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminActivity() {
  const { t, language } = useLanguage();
  const [data, setData] = useState<AdminCenterActivityResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.adminCenter
      .activity()
      .then(setData)
      .catch(() => setError(t('admin_error_load')));
  }, [t]);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return <LoadingHint label={t('admin_loading')} />;

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-txt-primary">{t('admin_activity')}</h2>
      <UserList rows={data.online} label={t('admin_activity_online')} lang={language} statusWhenOffline={() => t('admin_offline')} />
      <UserList rows={data.recentActive} label={t('admin_activity_recent')} lang={language} statusWhenOffline={(u) => `${t('admin_last_seen')} ${formatRelative(u.lastSeenAt, language)}`} />
      <UserList rows={data.newUsers} label={t('admin_activity_new')} lang={language} statusWhenOffline={(u) => `${t('admin_joined')} ${formatRelative(u.createdAt, language)}`} />
    </div>
  );
}
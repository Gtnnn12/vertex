import { useLanguage } from '../../contexts/LanguageContext';
import type { AdminCenterSummary } from '@vertex/shared';
import { Stat } from './adminShared';

export function AdminOverview({ summary }: { summary: AdminCenterSummary }) {
  const { t } = useLanguage();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-txt-primary">{t('admin_overview')}</h2>
        <div className="text-xs text-txt-tertiary mt-0.5">{t('admin_overview_sub')}</div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
        <Stat label={t('admin_stat_total_users')} value={summary.totalUsers} />
        <Stat label={t('admin_stat_online')} value={summary.onlineUsers} />
        <Stat label={t('admin_stat_new_7d')} value={summary.newUsers7d} />
        <Stat label={t('admin_stat_new_30d')} value={summary.newUsers30d} />
        <Stat label={t('admin_stat_netrex')} value={summary.netrexActive} sub={t('admin_stat_netrex_sub')} />
        <Stat label={t('admin_stat_netrex_permanent')} value={summary.netrexPermanent} />
        <Stat label={t('admin_stat_staff')} value={summary.staffCount} />
        <Stat label={t('admin_stat_banned')} value={summary.bannedUsers} />
        <Stat label={t('admin_stat_spaces')} value={summary.spacesCount} />
      </div>
    </div>
  );
}
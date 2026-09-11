import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useLanguage } from '../../contexts/LanguageContext';
import type { AdminCenterSummary } from '@backspace/shared';
import { StaffBadge } from '../ui/StaffBadge';
import { AdminOverview } from './AdminOverview';
import { AdminUsers } from './AdminUsers';
import { AdminNetrex } from './AdminNetrex';
import { AdminStaff } from './AdminStaff';
import { AdminModeration } from './AdminModeration';
import { AdminSpaces } from './AdminSpaces';
import { AdminActivity } from './AdminActivity';
import { AdminAuditLog } from './AdminAuditLog';
import { AdminSettings } from './AdminSettings';

export type AdminTab =
  | 'overview'
  | 'users'
  | 'netrex'
  | 'staff'
  | 'moderation'
  | 'spaces'
  | 'activity'
  | 'audit'
  | 'settings';

export function AdminCenter() {
  const { t } = useLanguage();
  const [summary, setSummary] = useState<AdminCenterSummary | null>(null);
  const [denied, setDenied] = useState(false);
  const [tab, setTab] = useState<AdminTab>('overview');

  useEffect(() => {
    let cancelled = false;
    api.adminCenter
      .summary()
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch(() => {
        if (!cancelled) setDenied(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (denied) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-12 h-12 rounded-full bg-accent-rose/15 text-accent-rose flex items-center justify-center mb-3">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
            />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-txt-primary">{t('admin_not_authorized')}</h3>
        <p className="text-sm text-txt-tertiary mt-1 max-w-xs">{t('admin_not_authorized_sub')}</p>
      </div>
    );
  }

  if (!summary) {
    return <div className="text-sm text-txt-tertiary py-6">{t('admin_loading')}</div>;
  }

  const viewer = summary.viewer;
  const canModerateStaff = viewer.canManageStaff;
  const canManage = viewer.canManageNetrex;

  const navItem = (id: AdminTab, label: string, disabled = false) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      disabled={disabled}
      className={`flex-none px-3 py-2 rounded-lg text-sm transition-colors whitespace-nowrap ${tab === id ? 'bg-interactive-selected text-txt-primary font-medium' : 'text-txt-tertiary hover:text-txt-secondary hover:bg-interactive-hover'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-lg font-semibold text-txt-primary">{t('admin_center')}</h2>
        <StaffBadge role={viewer.role} />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {navItem('overview', t('admin_overview'))}
        {navItem('users', t('admin_users'))}
        {navItem('netrex', t('admin_netrex'))}
        {navItem('staff', t('admin_staff'), !canModerateStaff)}
        {navItem('moderation', t('admin_moderation'))}
        {navItem('spaces', t('admin_spaces'))}
        {navItem('activity', t('admin_activity'))}
        {navItem('audit', t('admin_audit'))}
        {navItem('settings', t('admin_settings'), !canManage)}
      </div>

      <div className="pt-1">
        {tab === 'overview' && <AdminOverview summary={summary} />}
        {tab === 'users' && <AdminUsers viewer={viewer} />}
        {tab === 'netrex' && <AdminNetrex canManage={canManage} />}
        {tab === 'staff' && <AdminStaff canManage={canModerateStaff} viewer={viewer} />}
        {tab === 'moderation' && <AdminModeration viewer={viewer} />}
        {tab === 'spaces' && <AdminSpaces />}
        {tab === 'activity' && <AdminActivity />}
        {tab === 'audit' && <AdminAuditLog />}
        {tab === 'settings' && <AdminSettings />}
      </div>
    </div>
  );
}
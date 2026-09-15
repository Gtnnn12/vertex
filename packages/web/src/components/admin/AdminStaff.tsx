import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useLanguage } from '../../contexts/LanguageContext';
import { useUIStore } from '../../stores/uiStore';
import { Avatar } from '../ui/Avatar';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { StaffBadge } from '../ui/StaffBadge';
import { EmptyHint, ErrorBanner, LoadingHint, formatDateTime } from './adminShared';
import type { AdminCenterViewerCapabilities, StaffMember, StaffRole } from '@vertex/shared';

const ALL_ROLES: StaffRole[] = ['moderator', 'senior_moderator', 'support', 'developer', 'administrator', 'owner'];

/** Per-role visual identity: emoji glyph, accent color classes and short description key. */
const ROLE_META: Record<StaffRole, { glyph: string; accent: string; accentBg: string; descKey: string }> = {
  owner: { glyph: '👑', accent: 'text-accent-rose border-accent-rose/50 bg-accent-rose/10', accentBg: 'bg-accent-rose/15', descKey: 'admin_rank_owner_desc' },
  administrator: { glyph: '🛡️', accent: 'text-accent-amber border-accent-amber/50 bg-accent-amber/10', accentBg: 'bg-accent-amber/15', descKey: 'admin_rank_administrator_desc' },
  moderator: { glyph: '🔨', accent: 'text-accent-mint border-accent-mint/50 bg-accent-mint/10', accentBg: 'bg-accent-mint/15', descKey: 'admin_rank_moderator_desc' },
  senior_moderator: { glyph: '🔨', accent: 'text-accent-mint border-accent-mint/50 bg-accent-mint/10', accentBg: 'bg-accent-mint/15', descKey: 'admin_rank_senior_moderator_desc' },
  developer: { glyph: '💻', accent: 'text-accent-lavender border-accent-lavender/50 bg-accent-lavender/10', accentBg: 'bg-accent-lavender/15', descKey: 'admin_rank_developer_desc' },
  support: { glyph: '⭐', accent: 'text-accent-sky border-accent-sky/50 bg-accent-sky/10', accentBg: 'bg-accent-sky/15', descKey: 'admin_rank_support_desc' },
};

export function AdminStaff({ canManage, viewer }: { canManage: boolean; viewer: AdminCenterViewerCapabilities }) {
  const { t, language } = useLanguage();
  const addToast = useUIStore((s) => s.addToast);
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [error, setError] = useState('');
  const [pendingRemove, setPendingRemove] = useState<StaffMember | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const [assignSearch, setAssignSearch] = useState('');
  const [results, setResults] = useState<{ id: string; username: string; displayName: string | null; avatar: string | null; avatarColor: string | null }[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [roleSel, setRoleSel] = useState<StaffRole>('moderator');
  const [assignBusy, setAssignBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await api.adminCenter.staff();
      setStaff(res.staff);
    } catch {
      setError(t('admin_error_load'));
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const isSelf = (member: StaffMember) => member.userId === viewer.userId;

  const searchTarget = async (term: string) => {
    setAssignSearch(term);
    setSelectedId('');
    if (!term.trim()) return setResults([]);
    try {
      const res = await api.adminCenter.users({ q: term.trim(), filter: 'all', pageSize: 8 });
      setResults(
        res.users
          .filter((u) => !u.homeInstance && !u.isDeleted)
          .map((u) => ({ id: u.id, username: u.username, displayName: u.displayName, avatar: u.avatar, avatarColor: u.avatarColor }))
      );
    } catch {
      setResults([]);
    }
  };

  const assign = async () => {
    if (!selectedId) return;
    const target = results.find((u) => u.id === selectedId);
    setAssignBusy(true);
    try {
      await api.adminCenter.assignStaff(selectedId, roleSel);
      addToast(t('admin_rank_changed_toast').replace('{user}', target?.username ?? '').replace('{from}', t('admin_rank_none')).replace('{to}', t(`staff_badge_${roleSel}`)), 'success', 3500);
      setAssignSearch('');
      setResults([]);
      setSelectedId('');
      load();
    } catch {
      addToast(t('admin_error_action'), 'warning', 3000);
    } finally {
      setAssignBusy(false);
    }
  };

  const changeRole = async (member: StaffMember, role: StaffRole) => {
    const from = member.role;
    try {
      await api.adminCenter.changeStaffRole(member.userId, role);
      addToast(t('admin_rank_changed_toast').replace('{user}', member.username).replace('{from}', t(`staff_badge_${from}`)).replace('{to}', t(`staff_badge_${role}`)), 'success', 3500);
      load();
    } catch {
      addToast(t('admin_error_action'), 'warning', 3000);
      load();
    }
  };

  const remove = async () => {
    if (!pendingRemove) return;
    setRemoveBusy(true);
    try {
      await api.adminCenter.removeStaff(pendingRemove.userId);
      addToast(t('admin_staff_remove_success'), 'success', 3000);
      setPendingRemove(null);
      load();
    } catch {
      addToast(t('admin_error_action'), 'warning', 3000);
    } finally {
      setRemoveBusy(false);
    }
  };

  // Visual rank picker. The backend remains the authority: an option that the
  // server would reject still shows here, but the API returns 403 and the UI
  // surfaces the error. `disabled` only prevents obviously pointless clicks
  // (assigning owner from a lower rank, per STAFF_RANK rules).
  const canPickRole = (role: StaffRole) =>
    role !== 'owner' || viewer.role === 'owner';

  const RolePicker = ({ value, onSelect, currentRole }: { value: StaffRole; onSelect: (r: StaffRole) => void; currentRole?: StaffRole | null }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5" role="radiogroup" aria-label={t('admin_pick_rank')}>
      {ALL_ROLES.map((role) => {
        const meta = ROLE_META[role];
        const selected = value === role;
        const isCurrent = currentRole === role;
        return (
          <button
            key={role}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={!canPickRole(role)}
            onClick={() => onSelect(role)}
            className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-all duration-150
              ${selected ? `${meta.accent} ring-1 ring-current/40 scale-[1.01]` : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.12]'}
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/[0.02]`}
          >
            <span className={`text-base leading-none mt-0.5 ${selected ? '' : 'grayscale-[35%]'}`} aria-hidden="true">{meta.glyph}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-txt-primary">{t(`staff_badge_${role}`)}</span>
                {isCurrent && <span className="px-1 py-px text-[9px] uppercase tracking-wide rounded bg-white/[0.08] text-txt-tertiary">{t('admin_current_rank')}</span>}
              </span>
              <span className="block text-[11px] text-txt-tertiary mt-0.5 leading-snug">{t(meta.descKey)}</span>
            </span>
            {selected && (
              <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-txt-primary">{t('admin_staff')}</h2>
        <div className="text-xs text-txt-tertiary mt-0.5">{t('admin_staff_sub')}</div>
      </div>

      {canManage && (
        <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-3.5 space-y-3">
          <h3 className="text-sm font-semibold text-txt-primary">{t('admin_assign_staff_title')}</h3>
          <input value={assignSearch} onChange={(e) => searchTarget(e.target.value)} placeholder={t('admin_search_username')} className="input-search text-xs py-1 w-full" />
          {results.length > 0 && (
            <div className="space-y-1">
              {results.map((u) => (
                <button key={u.id} onClick={() => setSelectedId((cur) => (cur === u.id ? '' : u.id))} className={`flex items-center gap-2 w-full p-2 rounded transition-colors ${selectedId === u.id ? 'bg-accent-primary/15' : 'bg-white/[0.03] hover:bg-white/[0.06]'}`}>
                  <Avatar src={u.avatar ? api.uploads.url(u.avatar) : null} name={u.displayName || u.username} size={24} avatarColor={u.avatarColor as never} />
                  <span className="text-sm text-txt-primary">{u.username}</span>
                  {selectedId === u.id && <span className="ml-auto text-xs text-accent-primary">{t('admin_picked')}</span>}
                </button>
              ))}
            </div>
          )}
          {selectedId && (
            <div className="pt-1">
              <div className="text-xs text-txt-tertiary mb-1.5">{t('admin_pick_rank')}</div>
              <RolePicker value={roleSel} onSelect={setRoleSel} />
            </div>
          )}
          <div className="flex items-center justify-end">
            <button onClick={assign} disabled={!selectedId || assignBusy} className="px-3.5 py-1.5 text-xs font-semibold rounded bg-accent-primary hover:bg-accent-primary-hover active:scale-[0.99] text-white transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed">
              {t('admin_apply_changes')}
            </button>
          </div>
        </div>
      )}

      <ErrorBanner message={error} />
      {!staff && !error && <LoadingHint label={t('admin_loading')} />}
      {staff && staff.length === 0 && <EmptyHint label={t('admin_no_staff')} />}

      {staff && staff.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {staff.map((member) => (
            <div key={member.userId} className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-3">
              <div className="flex items-center gap-3">
                <Avatar src={member.avatar ? api.uploads.url(member.avatar) : null} name={member.displayName || member.username} size={36} avatarColor={member.avatarColor as never} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium text-txt-primary truncate">{member.username}</span>
                    <StaffBadge role={member.role} />
                    {isSelf(member) && <span className="px-1.5 py-0.5 text-[9.5px] font-semibold uppercase rounded bg-white/[0.06] text-txt-tertiary">{t('admin_you')}</span>}
                  </div>
                  <div className="text-xs text-txt-tertiary mt-0.5">
                    {member.grantedByUsername && (
                      <span>
                        {t('admin_by')} {member.grantedByUsername} · {formatDateTime(member.grantedAt, language)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {canManage && !isSelf(member) && (
                <div className="mt-2.5 pt-2.5 border-t border-white/[0.05]">
                  <div className="text-[11px] text-txt-tertiary mb-1.5">
                    {t('admin_current_rank')}: <span className="text-txt-secondary font-medium">{t(`staff_badge_${member.role}`)}</span>
                  </div>
                  <RolePicker value={member.role} onSelect={(r) => changeRole(member, r)} currentRole={member.role} />
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-txt-tertiary">{t('admin_rank_backend_note')}</span>
                    <button onClick={() => setPendingRemove(member)} className="px-2.5 py-1 text-xs rounded bg-accent-rose/15 hover:bg-accent-rose/25 text-accent-rose transition-colors">
                      {t('admin_remove')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {pendingRemove && (
        <ConfirmDialog
          isOpen
          loading={removeBusy}
          onClose={() => setPendingRemove(null)}
          onConfirm={remove}
          title={t('admin_remove_staff_title')}
          description={t('admin_remove_staff_body')}
          confirmLabel={t('admin_confirm')}
          cancelLabel={t('admin_cancel')}
          variant="danger"
        />
      )}
    </div>
  );
}

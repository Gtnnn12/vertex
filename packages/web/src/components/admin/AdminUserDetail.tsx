import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useLanguage } from '../../contexts/LanguageContext';
import { Avatar } from '../ui/Avatar';
import { StaffBadge } from '../ui/StaffBadge';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Card, EmptyHint, ErrorBanner, LoadingHint, formatDateTime, formatRelative } from './adminShared';
import type {
  AdminCenterUserDetail,
  AdminCenterUserRow,
  AdminCenterViewerCapabilities,
  ModerationAction,
  StaffRole,
} from '@backspace/shared';

const GRANT_PRESETS: { label: string; minutes: number | null }[] = [
  { label: '1h', minutes: 60 },
  { label: '1d', minutes: 1440 },
  { label: '3d', minutes: 4320 },
  { label: '7d', minutes: 10080 },
  { label: '14d', minutes: 20160 },
  { label: '30d', minutes: 43200 },
  { label: '90d', minutes: 129600 },
  { label: 'admin_permanent', minutes: null },
];

const DURATION_PRESETS: { label: string; hours: number }[] = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '12h', hours: 12 },
  { label: '24h', hours: 24 },
  { label: '3d', hours: 72 },
  { label: '7d', hours: 168 },
  { label: '30d', hours: 720 },
];

export function AdminUserDetail({
  userId,
  viewer,
  onToast,
  onChanged,
}: {
  userId: string;
  viewer: AdminCenterViewerCapabilities;
  onToast: (msg: string, type?: 'info' | 'warning' | 'success') => void;
  onChanged: () => void;
}) {
  const { t, language } = useLanguage();
  const [detail, setDetail] = useState<AdminCenterUserDetail | null>(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  const [grantSel, setGrantSel] = useState('1440');
  const [grantCustom, setGrantCustom] = useState('');

  const [staffSel, setStaffSel] = useState<StaffRole>(viewer.role);
  const [modAction, setModAction] = useState<ModerationAction | null>(null);
  const [modReason, setModReason] = useState('');
  const [modHours, setModHours] = useState('24');
  const [modCustomHours, setModCustomHours] = useState('');

  const [confirm, setConfirm] = useState<null | { kind: 'revokeNetrex' | 'removeStaff' | 'unban'; title: string; body: string }>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const d = await api.adminCenter.userDetail(userId);
      setDetail(d);
      if (d.user.staffRole) setStaffSel(d.user.staffRole);
    } catch {
      setError(t('admin_error_load'));
      if (!detail) setDetail(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const refreshUserRow = useCallback(
    (row: AdminCenterUserRow) => {
      setDetail((prev) => (prev ? { ...prev, user: row } : prev));
      onChanged();
    },
    [onChanged]
  );

  const handleError = useCallback(
    (err: unknown) => {
      const message = typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : '';
      setActionError(message || t('admin_error_action'));
    },
    [t]
  );

  const grantNetrex = async () => {
    const permanent = grantSel === 'admin_permanent';
    let durationMinutes: number | undefined;
    if (!permanent) {
      durationMinutes = Number(grantSel);
      if (grantSel === 'custom') {
        const days = Number(grantCustom);
        if (!days || days <= 0) return setActionError(t('admin_invalid_duration'));
        durationMinutes = days * 1440;
      }
    }
    setActionError('');
    try {
      const res = await api.adminCenter.grantNetrex(userId, permanent ? { permanent: true } : { durationMinutes });
      setDetail((prev) => (prev ? { ...prev, user: { ...prev.user, netrexState: res.netrexState, netrexExpiresAt: res.netrexExpiresAt } } : prev));
      onChanged();
      onToast(t('admin_grant_success'), 'success');
    } catch (e) {
      handleError(e);
    }
  };

  const revokeNetrex = async () => {
    setActionError('');
    try {
      const res = await api.adminCenter.revokeNetrex(userId);
      setDetail((prev) => (prev ? { ...prev, user: { ...prev.user, netrexState: res.netrexState, netrexExpiresAt: res.netrexExpiresAt } } : prev));
      onChanged();
      onToast(t('admin_revoke_success'), 'success');
      setConfirm(null);
    } catch (e) {
      handleError(e);
    }
  };

  const changeStaff = async (kind: 'assign' | 'change') => {
    setActionError('');
    try {
      if (kind === 'assign') {
        await api.adminCenter.assignStaff(userId, staffSel);
      } else {
        await api.adminCenter.changeStaffRole(userId, staffSel);
      }
      await load();
      onToast(kind === 'assign' ? t('admin_staff_assign_success') : t('admin_staff_change_success'), 'success');
    } catch (e) {
      handleError(e);
    }
  };

  const removeStaff = async () => {
    setActionError('');
    try {
      await api.adminCenter.removeStaff(userId);
      await load();
      onToast(t('admin_staff_remove_success'), 'success');
      setConfirm(null);
    } catch (e) {
      handleError(e);
    }
  };

  const runUnban = async () => {
    setActionError('');
    try {
      const res = await api.adminCenter.moderate(userId, { action: 'unban' });
      refreshUserRow(res.user);
      setDetail((prev) => (prev ? { ...prev, moderation: [res.event, ...(prev.moderation || [])] } : prev));
      onToast(t('admin_unban_success'), 'success');
      setConfirm(null);
    } catch (e) {
      handleError(e);
    }
  };

  const runModeration = async () => {
    if (!modAction) return;
    setActionError('');
    let durationHours: number | undefined;
    if (modAction === 'timeout' || modAction === 'ban') {
      if (modHours === 'custom') {
        const v = Number(modCustomHours);
        if (!v || v <= 0) return setActionError(t('admin_invalid_duration'));
        durationHours = v;
      } else {
        durationHours = Number(modHours);
      }
    }
    try {
      const res = await api.adminCenter.moderate(userId, { action: modAction, reason: modReason.trim() || undefined, durationHours });
      refreshUserRow(res.user);
      setDetail((prev) => (prev ? { ...prev, moderation: [res.event, ...(prev.moderation || [])] } : prev));
      onToast(t('admin_mod_success'), 'success');
      setModAction(null);
      setModReason('');
    } catch (e) {
      handleError(e);
    }
  };

  if (!detail && !error) return <LoadingHint label={t('admin_loading')} />;
  if (!detail) return <ErrorBanner message={error} />;

  const user = detail.user;
  const canManageNetrex = viewer.canManageNetrex;
  const canManageStaff = viewer.canManageStaff;
  const canBan = viewer.canBan;
  const canWarn = viewer.canModerate;
  const isBanned = !!user.bannedUntil;
  const isFederated = !!user.homeInstance;

  const actionButtons = (
    <>
      <button onClick={() => setModAction('warn')} disabled={!canWarn} className="px-3 py-1.5 text-xs font-medium rounded bg-white/[0.05] hover:bg-white/[0.09] text-txt-secondary disabled:opacity-40 transition-colors">
        {t('admin_button_warn')}
      </button>
      <button onClick={() => setModAction('timeout')} disabled={!canBan} className="px-3 py-1.5 text-xs font-medium rounded bg-white/[0.05] hover:bg-white/[0.09] text-txt-secondary disabled:opacity-40 transition-colors">
        {t('admin_button_timeout')}
      </button>
      <button onClick={() => setModAction('ban')} disabled={!canBan} className="px-3 py-1.5 text-xs font-medium rounded bg-accent-rose/15 hover:bg-accent-rose/25 text-accent-rose disabled:opacity-40 transition-colors">
        {t('admin_button_ban')}
      </button>
      <button
        onClick={() => setConfirm({ kind: 'unban', title: t('admin_confirm_unban'), body: t('admin_confirm_unban_body') })}
        disabled={!isBanned || !canBan}
        className="px-3 py-1.5 text-xs font-medium rounded bg-accent-mint/15 hover:bg-accent-mint/25 text-accent-mint disabled:opacity-40 transition-colors"
      >
        {t('admin_button_unban')}
      </button>
    </>
  );

  return (
    <div className="space-y-3">
      <ErrorBanner message={actionError || error} />

      <div className="flex items-center gap-3">
        <Avatar src={user.avatar ? api.uploads.url(user.avatar) : null} name={user.displayName || user.username} size={40} avatarColor={user.avatarColor as never} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-txt-primary truncate">{user.displayName || user.username}</span>
            <StaffBadge role={user.staffRole} />
            {user.netrexState !== 'none' && (
              <span className={`px-1.5 py-0.5 text-[9.5px] font-bold rounded uppercase tracking-wide ${user.netrexState === 'expired' ? 'bg-white/[0.06] text-txt-tertiary' : 'bg-accent-coral/20 text-accent-coral'}`}>
                {t(`admin_netrex_state_${user.netrexState}`)}
              </span>
            )}
            {user.isDeleted && <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-white/[0.06] text-txt-tertiary">{t('admin_deleted')}</span>}
            {isBanned && <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-accent-rose/20 text-accent-rose">{t('admin_banned')}</span>}
            {user.isAdmin && <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-accent-amber/20 text-accent-amber">{t('admin_legacy_admin')}</span>}
          </div>
          <div className="text-xs text-txt-tertiary mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
            <span>@{user.username}</span>
            {isFederated && <span>{user.homeInstance}</span>}
            <span>{t('admin_joined')} {formatDateTime(user.createdAt, language)}</span>
            <span>{t('admin_last_seen')} {formatRelative(user.lastSeenAt, language)}</span>
            {user.banReason && <span className="text-accent-rose">{t('admin_ban_reason')}: {user.banReason}</span>}
          </div>
        </div>
      </div>

      {canManageNetrex && (
        <Card>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-txt-primary">{t('admin_netrex')}</h3>
            {user.netrexState !== 'none' && (
              <button onClick={() => setConfirm({ kind: 'revokeNetrex', title: t('admin_revoke_netrex_title'), body: t('admin_revoke_netrex_body') })} className="px-2.5 py-1 text-xs rounded bg-accent-rose/15 hover:bg-accent-rose/25 text-accent-rose transition-colors">
                {t('admin_revoke')}
              </button>
            )}
          </div>
          <div className="text-xs text-txt-secondary mb-2">
            {user.netrexState === 'none' && t('admin_netrex_none')}
            {user.netrexState === 'active' && t('admin_netrex_active')}
            {user.netrexState === 'permanent' && t('admin_netrex_permanent_active')}
            {user.netrexState === 'expired' && t('admin_netrex_expired_desc')}
            {user.netrexExpiresAt && !(user.netrexState === 'expired') && ` · ${t('admin_expires')} ${formatRelative(user.netrexExpiresAt, language)}`}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {GRANT_PRESETS.map((p) => (
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
            <button onClick={grantNetrex} className="px-3 py-1 text-xs font-medium rounded bg-accent-coral/25 hover:bg-accent-coral/35 text-accent-coral transition-colors">
              {t('admin_grant')}
            </button>
          </div>
        </Card>
      )}

      {canManageStaff && (
        <Card>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-txt-primary">{t('admin_staff')}</h3>
            {user.staffRole && (
              <button onClick={() => setConfirm({ kind: 'removeStaff', title: t('admin_remove_staff_title'), body: t('admin_remove_staff_body') })} className="px-2.5 py-1 text-xs rounded bg-accent-rose/15 hover:bg-accent-rose/25 text-accent-rose transition-colors">
                {t('admin_remove')}
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <select value={staffSel} onChange={(e) => setStaffSel(e.target.value as StaffRole)} className="input-search text-xs py-1">
              {(['moderator', 'senior_moderator', 'support', 'developer', 'administrator', 'owner'] as StaffRole[]).map((r) => (
                <option key={r} value={r}>
                  {t(`staff_badge_${r}`)}
                </option>
              ))}
            </select>
            <button onClick={() => changeStaff(user.staffRole ? 'change' : 'assign')} className="px-3 py-1 text-xs font-medium rounded bg-accent-mint/20 hover:bg-accent-mint/30 text-accent-mint transition-colors">
              {user.staffRole ? t('admin_change_role') : t('admin_assign')}
            </button>
          </div>
          {!user.staffRole && <div className="text-xs text-txt-tertiary mt-2">{t('admin_staff_none')}</div>}
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-txt-primary">{t('admin_moderation')}</h3>
          {!modAction && <div className="flex items-center gap-1.5">{actionButtons}</div>}
        </div>
        {modAction && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              {actionButtons}
            </div>
            <input value={modReason} onChange={(e) => setModReason(e.target.value)} placeholder={t('admin_reason_optional')} className="input-search text-xs py-1 w-full" />
            {(modAction === 'timeout' || modAction === 'ban') && (
              <div className="flex flex-wrap items-center gap-1.5">
                {modAction === 'ban' && <span className="text-[11px] text-accent-rose">{t('admin_ban_hint')}</span>}
                {DURATION_PRESETS.map((d) => (
                  <button key={d.label} onClick={() => setModHours(String(d.hours))} className={`px-2 py-1 text-[11px] rounded transition-colors ${modHours === String(d.hours) ? 'bg-accent-rose/25 text-accent-rose' : 'bg-white/[0.05] text-txt-secondary hover:bg-white/[0.09]'}`}>
                    {d.label}
                  </button>
                ))}
                <button onClick={() => setModHours('custom')} className={`px-2 py-1 text-[11px] rounded transition-colors ${modHours === 'custom' ? 'bg-accent-rose/25 text-accent-rose' : 'bg-white/[0.05] text-txt-secondary hover:bg-white/[0.09]'}`}>
                  {t('admin_custom')}
                </button>
                {modHours === 'custom' && (
                  <div className="flex items-center gap-1">
                    <input value={modCustomHours} onChange={(e) => setModCustomHours(e.target.value)} placeholder={t('admin_hours')} className="input-search text-xs py-1 w-16" />
                    <span className="text-[10px] text-txt-tertiary">{t('admin_hours_short')}</span>
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <button onClick={runModeration} className="px-3 py-1 text-xs font-medium rounded bg-accent-rose/20 hover:bg-accent-rose/30 text-accent-rose transition-colors">
                {t('admin_confirm')}
              </button>
              <button onClick={() => { setModAction(null); setModReason(''); }} className="px-3 py-1 text-xs rounded bg-white/[0.05] text-txt-secondary hover:bg-white/[0.09] transition-colors">
                {t('admin_cancel')}
              </button>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-txt-primary mb-2">{t('admin_history')}</h3>
        {detail.moderation.length === 0 && <EmptyHint label={t('admin_no_history')} />}
        <div className="space-y-1.5">
          {detail.moderation.map((ev) => (
            <div key={ev.id} className="flex items-start gap-2 text-xs">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide flex-shrink-0 ${ev.action === 'ban' ? 'bg-accent-rose/20 text-accent-rose' : ev.action === 'unban' ? 'bg-accent-mint/20 text-accent-mint' : ev.action === 'timeout' ? 'bg-accent-amber/20 text-accent-amber' : 'bg-accent-sky/20 text-accent-sky'}`}>
                {t(`admin_mod_action_${ev.action}`)}
              </span>
              <div className="min-w-0 text-txt-secondary">
                <span className="text-txt-primary">{ev.actorUsername ?? ev.actorId}</span> · {formatDateTime(ev.createdAt, language)}
                {ev.durationSeconds && ev.expiresAt ? (
                  <span>
                    {' '}· {t('admin_for')} {ev.durationSeconds >= 86400 ? `${ev.durationSeconds / 86400}d` : ev.durationSeconds >= 3600 ? `${ev.durationSeconds / 3600}h` : `${ev.durationSeconds / 60}m`} → {t('admin_until')} {formatDateTime(ev.expiresAt, language)}
                  </span>
                ) : null}
                {ev.reason && <div className="text-txt-tertiary mt-0.5">{ev.reason}</div>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-txt-primary mb-2">{t('admin_user_spaces')}</h3>
        {detail.spaces.length === 0 && <EmptyHint label={t('admin_no_spaces_user')} />}
        <div className="space-y-1.5">
          {detail.spaces.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-xs text-txt-secondary">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${s.role === 'owner' ? 'bg-accent-amber/20 text-accent-amber' : 'bg-white/[0.06] text-txt-tertiary'}`}>
                {t(`admin_space_role_${s.role}`)}
              </span>
              <span className="truncate text-txt-primary flex-1">{s.name}</span>
              <span>{s.memberCount} {t('admin_members')}</span>
            </div>
          ))}
        </div>
      </Card>

      {confirm && (
        <ConfirmDialog
          isOpen
          onClose={() => setConfirm(null)}
          onConfirm={confirm.kind === 'revokeNetrex' ? revokeNetrex : confirm.kind === 'removeStaff' ? removeStaff : runUnban}
          title={confirm.title}
          description={confirm.body}
          confirmLabel={t('admin_confirm')}
          cancelLabel={t('admin_cancel')}
          variant="danger"
        />
      )}
    </div>
  );
}
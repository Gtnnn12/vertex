import { useState, useEffect, useCallback } from 'react';
import { useSettingsStore } from '../../../stores/settingsStore';
import { useUIStore } from '../../../stores/uiStore';
import { useLanguage } from '../../../contexts/LanguageContext';
import { Toggle } from '../../ui/Toggle';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { api, HttpError } from '../../../api/client';
import { onFederationPeersChanged, onFederationPeerResetDetected } from '../../../hooks/useWebSocket';
import type { InstanceAdminSettings } from '@backspace/shared';
import type { FederationPeer, ApprovalRequest, FederationResetEvent, FederationOrphanedAccount } from '../../../api/client';

// ─── Global Settings ─────────────────────────────────────────────────────────

function FederationGlobalSettings() {
  const instanceSettings = useSettingsStore((s) => s.instanceSettings);
  const updateInstanceSettings = useSettingsStore((s) => s.updateInstanceSettings);
  const addToast = useUIStore((s) => s.addToast);
  const { t } = useLanguage();

  const [draft, setDraft] = useState<Pick<InstanceAdminSettings, 'federationRelayEnabled' | 'federationRelayTtlDays' | 'defaultAutoRotateIntervalDays' | 'autoAcceptPeering'> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (instanceSettings) {
      setDraft({
        federationRelayEnabled: instanceSettings.federationRelayEnabled,
        federationRelayTtlDays: instanceSettings.federationRelayTtlDays,
        defaultAutoRotateIntervalDays: instanceSettings.defaultAutoRotateIntervalDays,
        autoAcceptPeering: instanceSettings.autoAcceptPeering,
      });
    }
  }, [instanceSettings]);

  if (!draft) return null;

  const hasChanges = instanceSettings
    ? draft.federationRelayEnabled !== instanceSettings.federationRelayEnabled ||
      draft.federationRelayTtlDays !== instanceSettings.federationRelayTtlDays ||
      draft.defaultAutoRotateIntervalDays !== instanceSettings.defaultAutoRotateIntervalDays ||
      draft.autoAcceptPeering !== instanceSettings.autoAcceptPeering
    : false;

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await updateInstanceSettings(draft);
      addToast(t('settings_saved'), 'success', 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('failed_to_save'));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (instanceSettings) {
      setDraft({
        federationRelayEnabled: instanceSettings.federationRelayEnabled,
        federationRelayTtlDays: instanceSettings.federationRelayTtlDays,
        defaultAutoRotateIntervalDays: instanceSettings.defaultAutoRotateIntervalDays,
        autoAcceptPeering: instanceSettings.autoAcceptPeering,
      });
    }
    setSaveError('');
  };

  return (
    <div>
      <div className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-1.5">{t('relay_settings')}</div>
      <p className="text-xs text-txt-tertiary mb-2">
        {t('relay_settings_hint')}
      </p>
      <div className="rounded-lg bg-white/[0.02] p-3.5 space-y-4">
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <div className="text-sm font-medium text-txt-primary">{t('enable_dm_relay')}</div>
            <div className="text-xs text-txt-tertiary mt-0.5">{t('enable_dm_relay_hint')}</div>
          </div>
          <Toggle enabled={draft.federationRelayEnabled} onChange={(v) => setDraft({ ...draft, federationRelayEnabled: v })} />
        </label>

        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <div className="text-sm font-medium text-txt-primary">{t('auto_accept_peering')}</div>
            <div className="text-xs text-txt-tertiary mt-0.5">{t('auto_accept_peering_hint')}</div>
          </div>
          <Toggle enabled={draft.autoAcceptPeering} onChange={(v) => setDraft({ ...draft, autoAcceptPeering: v })} />
        </label>

        <div>
          <div className="text-sm font-medium text-txt-primary mb-1">{t('relay_ttl_days')}</div>
          <div className="text-xs text-txt-tertiary mb-2">{t('relay_ttl_days_hint')}</div>
          <input
            type="number"
            min={1}
            max={365}
            value={draft.federationRelayTtlDays}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val >= 1 && val <= 365) {
                setDraft({ ...draft, federationRelayTtlDays: val });
              }
            }}
            className="input-standard w-24"
          />
        </div>

        <div>
          <div className="text-sm font-medium text-txt-primary mb-1">{t('default_secret_rotation_days')}</div>
          <div className="text-xs text-txt-tertiary mb-2">{t('default_secret_rotation_days_hint')}</div>
          <input
            type="number"
            min={1}
            max={365}
            value={draft.defaultAutoRotateIntervalDays}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val >= 1 && val <= 365) {
                setDraft({ ...draft, defaultAutoRotateIntervalDays: val });
              }
            }}
            className="input-standard w-24"
          />
        </div>
      </div>

      {saveError && (
        <div className="mt-2 p-2 bg-accent-rose/10 border border-accent-rose/30 rounded text-txt-danger text-sm">{saveError}</div>
      )}

      {hasChanges && (
        <div className="sticky bottom-0 z-10 pointer-events-none">
          <div className="flex justify-center pt-3 pb-1">
            <div className="glass-bubble rounded-full px-4 py-2 flex items-center gap-2 animate-slide-up pointer-events-auto">
              <button onClick={handleReset} className="px-3 py-1 text-sm text-txt-tertiary hover:text-txt-secondary transition-colors">
                {t('reset')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 bg-accent-primary hover:bg-accent-primary/80 text-white text-sm font-medium rounded-full transition-colors disabled:opacity-50"
              >
                {saving ? t('saving') : t('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelativeTime(timestamp: number | null, t: (k: string) => string): string {
  if (!timestamp) return t('never');
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return t('just_now');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('minutes_ago').replace('{n}', String(minutes));
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('hours_ago').replace('{n}', String(hours));
  const days = Math.floor(hours / 24);
  return t('days_ago').replace('{n}', String(days));
}

function formatAbsoluteDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function peerStatusColor(status: string): string {
  switch (status) {
    case 'active': return 'bg-status-online/15 text-status-online';
    case 'pending': return 'bg-accent-lavender/15 text-accent-lavender';
    case 'unreachable': return 'bg-accent-amber/15 text-accent-amber';
    case 'rejected': return 'bg-accent-rose/15 text-accent-rose';
    case 'awaiting_approval': return 'bg-accent-amber/15 text-accent-amber';
    case 'needs_attention': return 'bg-accent-rose/15 text-accent-rose';
    case 'revoked': return 'bg-white/5 text-txt-tertiary';
    default: return 'bg-white/5 text-txt-tertiary';
  }
}

function peerStatusDotColor(status: string): string {
  switch (status) {
    case 'active': return 'bg-status-online';
    case 'pending': return 'bg-accent-lavender';
    case 'unreachable': return 'bg-accent-amber';
    case 'rejected': return 'bg-accent-rose';
    case 'awaiting_approval': return 'bg-accent-amber';
    case 'needs_attention': return 'bg-accent-rose';
    default: return 'bg-txt-tertiary';
  }
}

function peerStatusLabel(status: string, t: (k: string) => string): string {
  switch (status) {
    case 'active': return t('status_active');
    case 'pending': return t('status_pending');
    case 'unreachable': return t('status_unreachable');
    case 'rejected': return t('status_rejected');
    case 'revoked': return t('status_revoked');
    case 'awaiting_approval': return t('status_awaiting_approval');
    case 'needs_attention': return t('status_needs_attention');
    default: return status;
  }
}

type PeerView = 'active' | 'revoked';
type SortBy = 'name' | 'lastSeen' | 'dateAdded' | 'failures';
type StatusFilter = 'active' | 'unreachable' | 'pending' | 'rejected' | 'awaiting_approval' | 'needs_attention';

// ─── Filter Dropdown ─────────────────────────────────────────────────────────

function FilterDropdown({
  view,
  statusFilter,
  setStatusFilter,
  sortBy,
  setSortBy,
}: {
  view: PeerView;
  statusFilter: Set<StatusFilter>;
  setStatusFilter: (f: Set<StatusFilter>) => void;
  sortBy: SortBy;
  setSortBy: (s: SortBy) => void;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();

  const toggleStatus = (s: StatusFilter) => {
    const next = new Set(statusFilter);
    if (next.has(s)) {
      if (next.size > 1) next.delete(s);
    } else {
      next.add(s);
    }
    setStatusFilter(next);
  };

  const sortOptions: Array<{ key: SortBy; label: string }> = view === 'active'
    ? [
        { key: 'name', label: t('sort_name') },
        { key: 'lastSeen', label: t('sort_last_seen') },
        { key: 'dateAdded', label: t('sort_date_added') },
        { key: 'failures', label: t('sort_failures') },
      ]
    : [
        { key: 'name', label: t('sort_name') },
        { key: 'dateAdded', label: t('sort_revoked_date') },
      ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-txt-tertiary hover:text-txt-secondary bg-white/[0.04] hover:bg-white/[0.06] rounded transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="opacity-60">
          <path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {t('filter')}
        <span className="text-[10px]">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 glass rounded-lg p-1.5 w-48">
            {view === 'active' && (
              <>
                <div className="text-[10px] font-semibold text-txt-tertiary uppercase tracking-wider px-2 py-1">{t('status')}</div>
                {(['active', 'unreachable', 'pending', 'rejected', 'awaiting_approval', 'needs_attention'] as StatusFilter[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleStatus(s)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded ${
                      statusFilter.has(s) ? 'text-txt-primary bg-white/[0.04]' : 'text-txt-tertiary'
                    } hover:bg-white/[0.06] transition-colors`}
                  >
                    <div className={`w-2 h-2 rounded-full ${peerStatusDotColor(s)}`} />
                    <span className="capitalize">
                      {s === 'awaiting_approval' ? t('status_awaiting_approval')
                        : s === 'needs_attention' ? t('status_needs_attention')
                        : s}
                    </span>
                  </button>
                ))}
                <div className="h-px bg-white/[0.06] my-1" />
              </>
            )}
            <div className="text-[10px] font-semibold text-txt-tertiary uppercase tracking-wider px-2 py-1">{t('sort_by')}</div>
            {sortOptions.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => { setSortBy(opt.key); setOpen(false); }}
                className={`w-full text-left px-2 py-1.5 text-xs rounded ${
                  sortBy === opt.key ? 'text-accent-lavender bg-accent-lavender/[0.08]' : 'text-txt-primary'
                } hover:bg-white/[0.06] transition-colors`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Peer List Controls ──────────────────────────────────────────────────────

function PeerListControls({
  view,
  setView,
  activeCount,
  revokedCount,
  statusFilter,
  setStatusFilter,
  sortBy,
  setSortBy,
}: {
  view: PeerView;
  setView: (v: PeerView) => void;
  activeCount: number;
  revokedCount: number;
  statusFilter: Set<StatusFilter>;
  setStatusFilter: (f: Set<StatusFilter>) => void;
  sortBy: SortBy;
  setSortBy: (s: SortBy) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex bg-white/[0.04] rounded-md p-0.5">
        <button
          type="button"
          onClick={() => setView('active')}
          className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
            view === 'active' ? 'bg-white/[0.08] text-txt-primary' : 'text-txt-tertiary hover:text-txt-secondary'
          }`}
        >
          {t('status_active')} <span className="text-[10px] text-txt-tertiary ml-0.5">{activeCount}</span>
        </button>
        <button
          type="button"
          onClick={() => setView('revoked')}
          className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
            view === 'revoked' ? 'bg-white/[0.08] text-txt-primary' : 'text-txt-tertiary hover:text-txt-secondary'
          }`}
        >
          {t('status_revoked')} <span className="text-[10px] text-txt-tertiary ml-0.5">{revokedCount}</span>
        </button>
      </div>
      <FilterDropdown
        view={view}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        sortBy={sortBy}
        setSortBy={setSortBy}
      />
    </div>
  );
}

// ─── Sorting ─────────────────────────────────────────────────────────────────

function sortPeers(peers: FederationPeer[], sortBy: SortBy, view: PeerView): FederationPeer[] {
  return [...peers].sort((a, b) => {
    switch (sortBy) {
      case 'name': {
        const nameA = (a.instanceName || new URL(a.origin).host).toLowerCase();
        const nameB = (b.instanceName || new URL(b.origin).host).toLowerCase();
        return nameA.localeCompare(nameB);
      }
      case 'lastSeen':
        return (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0);
      case 'dateAdded':
        return b.createdAt - a.createdAt;
      case 'failures':
        return (b.consecutiveFailures ?? 0) - (a.consecutiveFailures ?? 0);
      default:
        return 0;
    }
  });
}

// ─── Peer Row ────────────────────────────────────────────────────────────────

function PeerRow({ peer, view, expanded, onToggleExpand, onAction, onRecheck, recheckLoading, defaultAutoRotateIntervalDays }: {
  peer: FederationPeer;
  view: PeerView;
  expanded: boolean;
  onToggleExpand: () => void;
  onAction: (type: 'rotate' | 'revoke' | 'reinitiate' | 'delete' | 'reset') => void;
  onRecheck: () => void;
  recheckLoading: boolean;
  defaultAutoRotateIntervalDays: number;
}) {
  const [editingInterval, setEditingInterval] = useState(false);
  const [intervalDraft, setIntervalDraft] = useState(peer.autoRotateIntervalDays);
  const [intervalSaving, setIntervalSaving] = useState(false);
  const [intervalError, setIntervalError] = useState('');
  const addToast = useUIStore((s) => s.addToast);
  const { t } = useLanguage();

  const name = peer.instanceName || new URL(peer.origin).host;
  const isRevoked = view === 'revoked' || peer.status === 'rejected';
  const isDefault = peer.autoRotateIntervalDays === defaultAutoRotateIntervalDays;

  const handleSaveInterval = async () => {
    if (intervalDraft < 1 || intervalDraft > 365) {
      setIntervalError(t('must_be_range').replace('{min}', '1').replace('{max}', '365'));
      return;
    }
    setIntervalSaving(true);
    setIntervalError('');
    try {
      const result = await api.federation.updatePeer(peer.id, { autoRotateIntervalDays: intervalDraft });
      // Update peer in parent state via a re-fetch would be cleanest,
      // but for responsiveness we update the peer object directly.
      // This works because React re-renders from the parent's setPeers.
      peer.autoRotateIntervalDays = result.peer.autoRotateIntervalDays;
      setEditingInterval(false);
      addToast(t('rotation_interval_updated'), 'success', 2000);
    } catch (err) {
      setIntervalError(err instanceof Error ? err.message : t('failed_to_update'));
    } finally {
      setIntervalSaving(false);
    }
  };

  return (
    <div className={`bg-white/[0.02] rounded-md transition-colors ${isRevoked ? 'opacity-70' : ''} ${expanded ? 'border border-white/[0.06]' : ''}`}>
      {/* Compact row */}
      <div
        className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-white/[0.02] rounded-md"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-2 h-2 rounded-full shrink-0 ${isRevoked ? 'bg-txt-tertiary' : peerStatusDotColor(peer.status)}`} />
          <div className="min-w-0">
            <div className={`text-sm font-medium truncate ${isRevoked ? 'text-txt-tertiary line-through' : 'text-txt-primary'}`}>
              {name}
            </div>
            <div className="text-[11px] text-txt-tertiary truncate">
              {isRevoked
                ? t('peer_revoked_line').replace('{revoked}', formatAbsoluteDate(peer.lastSeenAt ?? peer.createdAt)).replace('{peered}', formatAbsoluteDate(peer.createdAt))
                : peer.status === 'unreachable'
                  ? t('peer_unreachable_line').replace('{lastSeen}', formatRelativeTime(peer.lastSeenAt, t)).replace('{failures}', String(peer.consecutiveFailures ?? 0))
                  : t('peer_line').replace('{lastSeen}', formatRelativeTime(peer.lastSeenAt, t)).replace('{synced}', formatRelativeTime(peer.lastSyncedAt, t))
              }
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded ${peerStatusColor(peer.status)}`}>
            {peerStatusLabel(peer.status, t)}
          </span>
          <span className="text-txt-tertiary text-xs">{expanded ? '▾' : '▸'}</span>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-3">
          <div className="border-t border-white/[0.05] pt-3">
            {isRevoked ? (
              /* Revoked peer actions */
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onAction('reinitiate'); }}
                  className="px-3 py-1.5 text-xs font-medium bg-status-online/10 text-status-online hover:bg-status-online/20 rounded transition-colors"
                >
                  {t('reinitiate_peering')}
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onAction('delete'); }}
                  className="px-3 py-1.5 text-xs font-medium bg-accent-rose/10 text-txt-danger hover:bg-accent-rose/20 rounded transition-colors"
                >
                  {t('delete_permanently')}
                </button>
              </div>
            ) : (
              <>
                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <div className="text-[10px] text-txt-tertiary uppercase tracking-wider mb-0.5">{t('consecutive_failures')}</div>
                    <div className={`text-xs ${(peer.consecutiveFailures ?? 0) > 0 ? 'text-accent-amber font-medium' : 'text-txt-secondary'}`}>
                      {peer.consecutiveFailures ?? 0}
                    </div>
                  </div>
                  {peer.status === 'needs_attention' && (
                    <div>
                      <div className="text-[10px] text-txt-tertiary uppercase tracking-wider mb-0.5">{t('auth_failures')}</div>
                      <div className="text-xs text-accent-rose font-medium">
                        {peer.consecutiveAuthFailures}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="text-[10px] text-txt-tertiary uppercase tracking-wider mb-0.5">{t('last_failure')}</div>
                    <div className="text-xs text-txt-secondary">{formatRelativeTime(peer.lastFailureAt, t)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-txt-tertiary uppercase tracking-wider mb-0.5">{t('peered_since')}</div>
                    <div className="text-xs text-txt-secondary">{formatAbsoluteDate(peer.createdAt)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <div className="text-[10px] text-txt-tertiary uppercase tracking-wider mb-0.5">{t('secret_rotated')}</div>
                    <div className="text-xs text-txt-secondary">{formatRelativeTime(peer.secretRotatedAt, t)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-txt-tertiary uppercase tracking-wider mb-0.5">{t('auto_rotate')}</div>
                    {editingInterval ? (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={intervalDraft}
                          onChange={(e) => setIntervalDraft(parseInt(e.target.value, 10) || 0)}
                          className="input-standard w-16 py-0.5 text-xs"
                          disabled={intervalSaving}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={handleSaveInterval}
                          disabled={intervalSaving}
                          className="text-[10px] text-accent-primary hover:text-accent-primary/80 disabled:opacity-50"
                        >
                          {intervalSaving ? '...' : t('save')}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditingInterval(false); setIntervalDraft(peer.autoRotateIntervalDays); setIntervalError(''); }}
                          className="text-[10px] text-txt-tertiary hover:text-txt-secondary"
                        >
                          {t('cancel')}
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs text-txt-secondary">
                        {t('every_days').replace('{n}', String(peer.autoRotateIntervalDays))}
                        {isDefault && <span className="text-[10px] text-txt-tertiary ml-1">({t('default')})</span>}
                      </div>
                    )}
                    {intervalError && <div className="text-[10px] text-txt-danger mt-0.5">{intervalError}</div>}
                  </div>
                  <div>
                    <div className="text-[10px] text-txt-tertiary uppercase tracking-wider mb-0.5">{t('rotation_status')}</div>
                    <div className="text-xs text-txt-secondary">
                      {peer.rotationInProgress ? t('in_progress') : t('idle')}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {peer.status === 'unreachable' && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onRecheck(); }}
                      disabled={recheckLoading}
                      className="px-3 py-1.5 text-xs font-medium bg-accent-mint/10 text-accent-mint hover:bg-accent-mint/20 rounded transition-colors disabled:opacity-50"
                    >
                      {recheckLoading ? t('checking') : t('check_now')}
                    </button>
                  )}
                  {peer.status === 'needs_attention' ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onAction('reset'); }}
                      className="px-3 py-1.5 text-xs font-medium bg-accent-rose/10 text-txt-danger hover:bg-accent-rose/20 rounded transition-colors"
                    >
                      {t('reset_peering')}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onAction('rotate'); }}
                        disabled={peer.rotationInProgress}
                        className="px-3 py-1.5 text-xs font-medium bg-accent-lavender/10 text-accent-lavender hover:bg-accent-lavender/20 rounded transition-colors disabled:opacity-50"
                        title={peer.rotationInProgress ? t('rotation_in_progress') : undefined}
                      >
                        {t('rotate_secret')}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onAction('revoke'); }}
                        className="px-3 py-1.5 text-xs font-medium bg-accent-rose/10 text-txt-danger hover:bg-accent-rose/20 rounded transition-colors"
                      >
                        {t('revoke')}
                      </button>
                      {!editingInterval && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setEditingInterval(true); setIntervalDraft(peer.autoRotateIntervalDays); }}
                          className="text-[11px] text-txt-tertiary hover:text-txt-secondary underline decoration-dotted transition-colors ml-1"
                        >
                          {t('edit_rotation_interval')}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pending Approvals ──────────────────────────────────────────────────────

function PendingApprovals({ onCountChange }: { onCountChange?: (count: number) => void }) {
  const addToast = useUIStore((s) => s.addToast);
  const { t } = useLanguage();
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'approve' | 'deny';
    request: ApprovalRequest;
  } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.federation.approvalRequests();
      setRequests(result.requests);
      onCountChange?.(result.requests.length);
    } catch {
      // Silently fail — empty list shown
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Real-time updates: re-fetch approval requests on federation changes
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const unsub = onFederationPeersChanged(() => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        fetchRequests();
      }, 500);
    });
    return () => { unsub(); clearTimeout(timeout); };
  }, [fetchRequests]);

  const handleConfirm = async () => {
    if (!confirmAction) return;
    const { type, request: req } = confirmAction;
    setActionLoading(req.id);
    setErrors((prev) => { const next = { ...prev }; delete next[req.id]; return next; });

    try {
      if (type === 'approve') {
        await api.federation.approveRequest(req.id);
        setRequests((prev) => prev.filter((r) => r.id !== req.id));
        onCountChange?.(requests.length - 1);
        addToast(t('peering_established').replace('{name}', req.instanceName || req.origin), 'success', 3000);
      } else {
        await api.federation.denyRequest(req.id);
        setRequests((prev) => prev.filter((r) => r.id !== req.id));
        onCountChange?.(requests.length - 1);
        addToast(t('denied_peering_request').replace('{name}', req.instanceName || req.origin), 'success', 3000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('action_failed');
      setErrors((prev) => ({ ...prev, [req.id]: msg }));
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  };

  if (requests.length === 0 && !loading) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <div className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider">{t('pending_approval_requests')}</div>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-accent-amber/15 text-accent-amber">
          {requests.length}
        </span>
      </div>
      <div className="rounded-lg bg-white/[0.02] p-3.5 space-y-2 mb-5">
        {loading && requests.length === 0 && (
          <div className="text-xs text-txt-tertiary py-2">{t('loading')}</div>
        )}
        {requests.map((req) => {
          const isOutbound = req.direction === 'outbound';
          let name = req.instanceName || '';
          if (!name) {
            try {
              name = new URL(req.origin).host;
            } catch {
              name = req.origin;
            }
          }
          const subCount = req.subscribers?.length ?? 0;
          const titleText = isOutbound
            ? (subCount === 1 ? t('peer_user_wants') : t('peer_users_want')).replace('{name}', name).replace('{count}', String(subCount))
            : name;
          return (
            <div key={req.id} className="bg-white/[0.02] rounded-md px-3 py-2.5">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-txt-primary truncate">{titleText}</div>
                  <div className="text-[11px] text-txt-tertiary truncate">{req.origin}</div>
                  <div className="text-[11px] text-txt-tertiary mt-0.5">
                    {t('requested').replace('{time}', formatRelativeTime(req.requestedAt, t))}
                  </div>
                  {isOutbound && req.subscribers && req.subscribers.length > 0 && (
                    <div className="mt-1.5 space-y-0.5">
                      {req.subscribers.map((sub) => (
                        <div
                          key={`${sub.userId}:${sub.triggerReason}:${sub.triggerTarget}`}
                          className="text-[11px] text-txt-tertiary"
                        >
                          <span className="font-medium text-txt-secondary">{sub.username}</span>
                          {' — '}
                          {sub.triggerReason === 'friend_add' && t('friend_add_to').replace('{target}', sub.triggerTarget)}
                          {sub.triggerReason === 'space_join' && t('wants_to_join').replace('{target}', sub.triggerTarget)}
                          {sub.triggerReason === 'direct_message' && t('wants_to_dm').replace('{target}', sub.triggerTarget)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <button
                    type="button"
                    onClick={() => setConfirmAction({ type: 'approve', request: req })}
                    disabled={actionLoading === req.id}
                    className="px-3 py-1.5 text-xs font-medium bg-status-online/10 text-status-online hover:bg-status-online/20 rounded transition-colors disabled:opacity-50"
                  >
                    {t('approve')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmAction({ type: 'deny', request: req })}
                    disabled={actionLoading === req.id}
                    className="px-3 py-1.5 text-xs font-medium bg-accent-rose/10 text-txt-danger hover:bg-accent-rose/20 rounded transition-colors disabled:opacity-50"
                  >
                    {t('deny')}
                  </button>
                </div>
              </div>
              {errors[req.id] && (
                <div className="mt-2 p-2 bg-accent-rose/10 border border-accent-rose/30 rounded text-txt-danger text-[11px]">
                  {errors[req.id]}
                  <button
                    type="button"
                    onClick={() => setErrors((prev) => { const next = { ...prev }; delete next[req.id]; return next; })}
                    className="ml-2 underline"
                  >
                    {t('dismiss')}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {confirmAction && (() => {
        const isOutbound = confirmAction.request.direction === 'outbound';
        const targetName = confirmAction.request.instanceName || confirmAction.request.origin;
        const subCount = confirmAction.request.subscribers?.length ?? 0;
        const description =
          confirmAction.type === 'approve'
            ? isOutbound
              ? (subCount === 1 ? t('approve_handshake_outbound_singular') : t('approve_handshake_outbound_plural')).replace('{name}', targetName).replace('{count}', String(subCount))
              : t('approve_handshake_inbound').replace('{name}', targetName)
            : isOutbound
              ? (subCount === 1 ? t('deny_outbound_singular') : t('deny_outbound_plural')).replace('{count}', String(subCount))
              : t('deny_inbound').replace('{name}', targetName);
        const confirmLabel =
          confirmAction.type === 'approve'
            ? isOutbound ? t('approve_and_peer') : t('approve')
            : isOutbound ? t('deny_and_notify') : t('deny');
        return (
          <ConfirmDialog
            isOpen={true}
            onClose={() => { if (!actionLoading) setConfirmAction(null); }}
            onConfirm={handleConfirm}
            title={confirmAction.type === 'approve' ? t('approve_peering_request') : t('deny_peering_request')}
            description={description}
            confirmLabel={confirmLabel}
            variant={confirmAction.type === 'approve' ? 'warning' : 'danger'}
            loading={!!actionLoading}
          />
        );
      })()}
    </div>
  );
}

// ─── Reset Cleanup ──────────────────────────────────────────────────────────
//
// Admin attention surface for the instance-epoch self-healing flow (§6.4) and
// the orphaned-account detach flow (detach spec §4.6). Two stacked surfaces:
//   1. A persistent accent-rose banner per peer detected as reset
//      (status === 'needs_attention' && needsAttentionReason === 'peer_reset_detected'),
//      with a one-click Re-peer (resetPeer → initiatePeering) that triggers the
//      server-side heal on activation. This one is genuinely actionable, so it
//      keeps the rose/danger styling.
//   2. Per-origin, informational cards for the dead incarnation's detached real
//      accounts. Detachment is not a failure state: these accounts keep working
//      locally and their owners sign in with the same password. The card offers a
//      real, server-side Dismiss (acknowledgeResetEvent — hides the card without
//      touching the accounts) and a per-account Remove (full purge via the existing
//      admin delete) for the ones that truly are abandoned. Neutral tier styling —
//      no urgency. Acknowledged events are filtered out client-side (the endpoint
//      keeps returning them for audit).

function peerName(peer: FederationPeer): string {
  if (peer.instanceName) return peer.instanceName;
  try {
    return new URL(peer.origin).host;
  } catch {
    return peer.origin;
  }
}

function originHost(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}

type ResetConfirmAction =
  | { kind: 'repeer'; peer: FederationPeer }
  | { kind: 'remove'; account: FederationOrphanedAccount; origin: string };

function ResetCleanup() {
  const addToast = useUIStore((s) => s.addToast);
  const { t } = useLanguage();
  const [resetPeers, setResetPeers] = useState<FederationPeer[]>([]);
  const [events, setEvents] = useState<FederationResetEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ResetConfirmAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [peersResult, eventsResult] = await Promise.all([
        api.federation.peers(),
        api.federation.resetEvents(),
      ]);
      setResetPeers(
        peersResult.peers.filter(
          (p) => p.status === 'needs_attention' && p.needsAttentionReason === 'peer_reset_detected',
        ),
      );
      setEvents(eventsResult.events);
    } catch {
      // Silently fail — empty surface shown; the peer list section surfaces load errors.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Real-time: re-fetch (debounced) on any federation change.
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const unsub = onFederationPeersChanged(() => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        fetchAll();
      }, 500);
    });
    return () => { unsub(); clearTimeout(timeout); };
  }, [fetchAll]);

  // Real-time: a fresh reset detection nudges the admin (the banner is the real
  // surface) and triggers an immediate re-fetch.
  useEffect(() => {
    const unsub = onFederationPeerResetDetected((origin) => {
      addToast(t('peer_was_reset_toast').replace('{origin}', originHost(origin)), 'warning');
      fetchAll();
    });
    return () => { unsub(); };
  }, [addToast, fetchAll]);

  const handleConfirm = async () => {
    if (!confirmAction) return;
    setActionLoading(true);
    try {
      if (confirmAction.kind === 'repeer') {
        const { peer } = confirmAction;
        // Order matters: reset the stale local record BEFORE the fresh handshake,
        // so activation heals stale friendships/DMs against the new incarnation.
        await api.federation.resetPeer(peer.id);
        const result = await api.federation.initiatePeering({ remoteOrigin: peer.origin });
        if (result.verified === false || result.peer?.status === 'needs_attention') {
          addToast(
            t('repeer_incomplete').replace('{name}', peerName(peer)),
            'warning',
          );
        } else {
          addToast(t('repeer_initiated').replace('{name}', peerName(peer)), 'success', 3000);
        }
        await fetchAll();
      } else {
        const { account } = confirmAction;
        await api.admin.deleteUser(account.id);
        addToast(t('removed_account').replace('{username}', account.username), 'success', 3000);
        await fetchAll();
      }
    } catch (err) {
      if (confirmAction.kind === 'remove') {
        const ownsSpaces =
          err instanceof HttpError &&
          err.status === 400 &&
          Array.isArray((err.body as { ownedSpaces?: unknown } | undefined)?.ownedSpaces);
        if (ownsSpaces) {
          addToast(
            t('owns_spaces_warning').replace('{username}', confirmAction.account.username),
            'warning',
          );
        } else {
          addToast(err instanceof Error ? err.message : t('failed_to_remove_account'), 'warning');
        }
      } else if (
        err instanceof HttpError && err.status === 409 &&
        (err.body as { code?: string } | undefined)?.code === 'PEER_EXISTS_RESET_REQUIRED'
      ) {
        addToast(
          t('remote_stale_peering'),
          'warning',
        );
      } else {
        addToast(err instanceof Error ? err.message : t('repeering_failed'), 'warning');
      }
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  // Dismiss the detached-accounts card without touching the accounts — the event
  // stays in the DB (acknowledged) for audit but stops surfacing to the admin.
  const handleDismiss = async (origin: string) => {
    setActionLoading(true);
    try {
      await api.federation.acknowledgeResetEvent(origin);
      await fetchAll();
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('failed_to_dismiss'), 'warning');
    } finally {
      setActionLoading(false);
    }
  };

  // Only unacknowledged events with detached accounts surface a card. Dismissed
  // (acknowledged) events are filtered out here and drop off the badge count.
  const eventsWithOrphans = events.filter(
    (e) => e.orphanedAccounts.length > 0 && e.acknowledgedAt === null,
  );

  // Render nothing when there is no reset-detected peer and no orphaned account —
  // exactly as PendingApprovals returns null when empty (loading also renders null).
  if (resetPeers.length === 0 && eventsWithOrphans.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <div className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider">{t('reset_cleanup')}</div>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-accent-rose/15 text-accent-rose">
          {resetPeers.length + eventsWithOrphans.length}
        </span>
      </div>

      {/* Reset-detected peer banners */}
      {resetPeers.length > 0 && (
        <div className="space-y-2 mb-3">
          {resetPeers.map((peer) => (
            <div
              key={peer.id}
              className="bg-accent-rose/10 border border-accent-rose/30 rounded-lg p-3.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-txt-primary">
                    {t('peer_was_reset').replace('{name}', peerName(peer))}
                  </div>
                  <div className="text-[11px] text-txt-tertiary truncate">{peer.origin}</div>
                  <p className="text-xs text-txt-secondary mt-1.5 leading-relaxed">
                    {t('peer_reset_detail')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmAction({ kind: 'repeer', peer })}
                  disabled={actionLoading}
                  className="shrink-0 px-3 py-1.5 text-xs font-medium bg-accent-mint/10 text-accent-mint hover:bg-accent-mint/20 rounded transition-colors disabled:opacity-50"
                >
                  {t('repeer')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Orphaned real accounts per reset origin */}
      {eventsWithOrphans.length > 0 && (
        <div className="rounded-lg bg-white/[0.02] p-3.5 space-y-4 mb-5">
          {eventsWithOrphans.map((event) => (
            <div key={`${event.origin}:${event.deadEpoch}`}>
              <div className="text-xs text-txt-tertiary mb-2 leading-relaxed">
                <span className="font-medium text-txt-secondary">{originHost(event.origin)}</span>{' '}
                {t('origin_reset_summary')
                  .replace('{stubCount}', String(event.stubCount))
                  .replace('{stubLabel}', event.stubCount === 1 ? t('identity') : t('identities'))
                  .replace('{accountCount}', String(event.orphanedAccounts.length))
                  .replace('{accountLabel}', event.orphanedAccounts.length === 1 ? t('account') : t('accounts'))}
              </div>
              <div className="space-y-2">
                {event.orphanedAccounts.map((account) => (
                  <div key={account.id} className="bg-white/[0.02] rounded-md px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-txt-primary truncate">
                          {account.displayName || account.username}
                        </div>
                        <div className="text-[11px] text-txt-tertiary truncate">{account.username}</div>
                        <div className="text-[11px] text-txt-tertiary mt-0.5">
                          {account.spaceMemberCount}{' '}
                          {account.spaceMemberCount === 1 ? t('membership') : t('memberships')} ·{' '}
                          {account.messageCount}{' '}
                          {account.messageCount === 1 ? t('message') : t('messages')}
                        </div>
                        {account.ownedSpaces.length > 0 && (
                          <div className="text-[11px] text-accent-amber mt-0.5 truncate">
                            {t('owns')}: {account.ownedSpaces.map((s) => s.name).join(', ')}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmAction({ kind: 'remove', account, origin: event.origin })
                          }
                          disabled={actionLoading}
                          className="px-3 py-1.5 text-xs font-medium bg-accent-rose/10 text-txt-danger hover:bg-accent-rose/20 rounded transition-colors disabled:opacity-50"
                        >
                          {t('remove')}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => handleDismiss(event.origin)}
                disabled={actionLoading}
                className="mt-2 px-3 py-1.5 text-xs font-medium text-txt-tertiary hover:text-txt-secondary bg-white/[0.04] hover:bg-white/[0.06] rounded transition-colors disabled:opacity-50"
              >
                {t('dismiss_keep_accounts')}
              </button>
            </div>
          ))}
        </div>
      )}

      {confirmAction && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => { if (!actionLoading) setConfirmAction(null); }}
          onConfirm={handleConfirm}
          title={confirmAction.kind === 'repeer' ? t('reestablish_federation') : t('remove_detached_account')}
          description={
            confirmAction.kind === 'repeer'
              ? t('repeer_confirm_desc').replace('{origin}', confirmAction.peer.origin)
              : t('remove_detached_confirm').replace('{username}', confirmAction.account.username)
          }
          confirmLabel={confirmAction.kind === 'repeer' ? t('repeer_and_heal') : t('delete_permanently')}
          variant={confirmAction.kind === 'repeer' ? 'warning' : 'danger'}
          loading={actionLoading}
        />
      )}
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

export function FederationPanel({ onApprovalCountChange }: { onApprovalCountChange?: (count: number) => void }) {
  const addToast = useUIStore((s) => s.addToast);
  const { t } = useLanguage();

  const [approvalCount, setApprovalCount] = useState(0);

  const handleApprovalCountChange = useCallback((count: number) => {
    setApprovalCount(count);
    onApprovalCountChange?.(count);
  }, [onApprovalCountChange]);

  // Peer list state
  const [peers, setPeers] = useState<FederationPeer[]>([]);
  const [peersLoading, setPeersLoading] = useState(false);
  const [peersError, setPeersError] = useState('');
  const [view, setView] = useState<PeerView>('active');
  const [statusFilter, setStatusFilter] = useState<Set<StatusFilter>>(
    new Set(['active', 'unreachable', 'pending', 'rejected', 'awaiting_approval', 'needs_attention']),
  );
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [expandedPeerId, setExpandedPeerId] = useState<string | null>(null);

  // Confirm dialog state (used in Task 10)
  const [confirmAction, setConfirmAction] = useState<{
    type: 'rotate' | 'revoke' | 'reinitiate' | 'delete' | 'reset';
    peer: FederationPeer;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [recheckingId, setRecheckingId] = useState<string | null>(null);

  const fetchPeers = useCallback(async () => {
    setPeersLoading(true);
    setPeersError('');
    try {
      const result = await api.federation.peers();
      setPeers(result.peers);
    } catch (err) {
      setPeersError(err instanceof Error ? err.message : t('failed_to_load_peers'));
    } finally {
      setPeersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPeers();
  }, [fetchPeers]);

  // Real-time updates: re-fetch peers and approval requests on any federation change
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const unsub = onFederationPeersChanged(() => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        fetchPeers();
      }, 500);
    });
    return () => { unsub(); clearTimeout(timeout); };
  }, [fetchPeers]);

  // Derived peer lists
  const activePeers = peers.filter((p) => p.status !== 'revoked');
  const revokedPeers = peers.filter((p) => p.status === 'revoked');

  const filteredPeers = view === 'active'
    ? activePeers.filter((p) => statusFilter.has(p.status as StatusFilter))
    : revokedPeers;

  const sortedPeers = sortPeers(filteredPeers, sortBy, view);

  // Empty state message
  const emptyMessage = peers.length === 0
    ? t('no_peers_configured')
    : view === 'active' && filteredPeers.length === 0
      ? t('no_peers_match_filter')
      : view === 'revoked' && revokedPeers.length === 0
        ? t('no_revoked_peers')
        : null;

  const handleRecheck = async (peer: FederationPeer) => {
    setRecheckingId(peer.id);
    try {
      const result = await api.federation.recheckPeer(peer.id);
      const name = peer.instanceName || new URL(peer.origin).host;
      if (result.recovered) {
        setPeers((prev) => prev.map((p) =>
          p.id === peer.id ? { ...p, status: 'active' } : p
        ));
        addToast(t('peer_back_online').replace('{name}', name), 'success', 3000);
      } else {
        addToast(t('peer_still_unreachable').replace('{name}', name), 'warning', 3000);
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('recheck_failed'), 'warning', 3000);
    } finally {
      setRecheckingId(null);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    const { type, peer } = confirmAction;
    setActionLoading(true);

    try {
      switch (type) {
        case 'rotate': {
          await api.federation.rotatePeerSecret(peer.id);
          setPeers((prev) => prev.map((p) =>
            p.id === peer.id ? { ...p, rotationInProgress: true } : p
          ));
          addToast(t('secret_rotation_initiated'), 'success', 3000);
          break;
        }
        case 'revoke': {
          await api.federation.revokePeer(peer.id);
          setPeers((prev) => prev.map((p) =>
            p.id === peer.id ? { ...p, status: 'revoked' } : p
          ));
          addToast(t('peer_revoked'), 'success', 2000);
          break;
        }
        case 'reinitiate': {
          const origin = peer.origin;
          await api.federation.deletePeerPermanently(peer.id);
          setPeers((prev) => prev.filter((p) => p.id !== peer.id));
          try {
            const result = await api.federation.initiatePeering({ remoteOrigin: origin });
            setPeers((prev) => [...prev, result.peer]);
            addToast(t('peering_reinitiated'), 'success', 2000);
          } catch (err) {
            addToast(
              t('peer_handshake_failed').replace('{message}', (err as Error).message).replace('{origin}', origin),
              'warning',
              5000,
            );
          }
          break;
        }
        case 'delete': {
          await api.federation.deletePeerPermanently(peer.id);
          setPeers((prev) => prev.filter((p) => p.id !== peer.id));
          addToast(t('peer_permanently_deleted'), 'success', 2000);
          break;
        }
        case 'reset': {
          await api.federation.resetPeer(peer.id);
          setPeers((prev) => prev.filter((p) => p.id !== peer.id));
          addToast(t('peering_reset').replace('{name}', peer.instanceName || peer.origin), 'success', 3000);
          break;
        }
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('action_failed'), 'warning', 3000);
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  const confirmDialogProps = confirmAction ? (() => {
    const name = confirmAction.peer.instanceName || new URL(confirmAction.peer.origin).host;
    switch (confirmAction.type) {
      case 'rotate': return {
        title: t('rotate_hmac_secret'),
        description: t('rotate_secret_desc').replace('{name}', name),
        confirmLabel: t('rotate'),
        variant: 'warning' as const,
      };
      case 'revoke': return {
        title: t('revoke_peer'),
        description: t('revoke_peer_desc').replace('{name}', name),
        confirmLabel: t('status_revoked'),
        variant: 'danger' as const,
      };
      case 'reinitiate': return {
        title: t('reinitiate_peering_title'),
        description: t('reinitiate_peering_desc').replace('{origin}', confirmAction.peer.origin),
        confirmLabel: t('reinitiate'),
        variant: 'warning' as const,
      };
      case 'delete': return {
        title: t('delete_peer_record'),
        description: t('delete_peer_record_desc').replace('{name}', name),
        confirmLabel: t('delete'),
        variant: 'danger' as const,
      };
      case 'reset': return {
        title: t('reset_peering_title'),
        description: t('reset_peering_desc').replace('{name}', name),
        confirmLabel: t('reset'),
        variant: 'danger' as const,
      };
    }
  })() : null;

  return (
    <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
      <h2 className="text-lg font-semibold text-txt-primary">{t('federation')}</h2>
      <div className="text-xs text-txt-tertiary">
        {t('federation_hint')}
      </div>

      <FederationGlobalSettings />

      <ResetCleanup />

      <PendingApprovals onCountChange={handleApprovalCountChange} />

      {/* Peered Instances */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider">{t('peered_instances')}</div>
          <button
            type="button"
            onClick={fetchPeers}
            disabled={peersLoading}
            className="text-[11px] text-txt-tertiary hover:text-txt-secondary transition-colors disabled:opacity-50"
          >
            {peersLoading ? t('loading') : t('refresh')}
          </button>
        </div>

        <div className="rounded-lg bg-white/[0.02] p-3.5">
          {peers.length > 0 && (
            <PeerListControls
              view={view}
              setView={setView}
              activeCount={activePeers.length}
              revokedCount={revokedPeers.length}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              sortBy={sortBy}
              setSortBy={setSortBy}
            />
          )}

          {peersError && (
            <div className="p-2 bg-accent-rose/10 border border-accent-rose/30 rounded text-txt-danger text-xs mb-2">
              {peersError}
              <button type="button" onClick={fetchPeers} className="ml-2 underline">{t('retry')}</button>
            </div>
          )}

          {sortedPeers.length > 0 && (
            <div className="space-y-2">
              {sortedPeers.map((peer) => (
                <PeerRow
                  key={peer.id}
                  peer={peer}
                  view={view}
                  expanded={expandedPeerId === peer.id}
                  onToggleExpand={() => setExpandedPeerId(expandedPeerId === peer.id ? null : peer.id)}
                  onAction={(type) => setConfirmAction({ type, peer })}
                  onRecheck={() => handleRecheck(peer)}
                  recheckLoading={recheckingId === peer.id}
                  defaultAutoRotateIntervalDays={useSettingsStore.getState().instanceSettings?.defaultAutoRotateIntervalDays ?? 90}
                />
              ))}
            </div>
          )}

          {emptyMessage && !peersError && !peersLoading && (
            <div className="text-xs text-txt-tertiary py-2">{emptyMessage}</div>
          )}
        </div>
      </div>

      {confirmAction && confirmDialogProps && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => { if (!actionLoading) setConfirmAction(null); }}
          onConfirm={handleConfirmAction}
          title={confirmDialogProps.title}
          description={confirmDialogProps.description}
          confirmLabel={confirmDialogProps.confirmLabel}
          variant={confirmDialogProps.variant}
          loading={actionLoading}
        />
      )}
    </form>
  );
}

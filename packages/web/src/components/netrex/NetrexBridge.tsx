import React, { useMemo, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import {
  useNetrexPrefsStore,
  type NetrexFeatureId,
} from '../../stores/netrexPrefsStore';
import {
  useNetrexLicenseStore,
} from '../../stores/netrexLicenseStore';
import { isElectron, getElectronAPI } from '../../platform/platform';

import { NetrexPurchaseModal } from './NetrexPurchaseModal';

/**
 * Startup re-verification: when the desktop app boots with a stored license,
 * ask the main process to re-verify it online (7-day offline grace handled in
 * main). Clears the local entitlement when the license is no longer valid.
 */
function useStartupLicenseRecheck(): void {
  const licenseKey = useNetrexLicenseStore((s) => s.licenseKey);
  const clear = useNetrexLicenseStore((s) => s.clear);
  const markVerified = useNetrexLicenseStore((s) => s.markVerified);

  useEffect(() => {
    if (!licenseKey || !isElectron() || !getElectronAPI()?.checkNetrexLicense) return;
    let cancelled = false;
    void getElectronAPI()!.checkNetrexLicense().then((result) => {
      if (cancelled) return;
      if (result.ok) markVerified();
      else if (result.error === 'invalid' || result.error === 'refunded' || result.error === 'uses_exceeded') clear();
      // 'network' / 'server': keep the cached entitlement (grace period).
    });
    return () => {
      cancelled = true;
    };
  }, [licenseKey, clear, markVerified]);
}

const NETREX_PREFS_KEY = 'vertex.netrex.preferences';

// ─── Status header (real backend entitlement state) ─────────────────────────

function HubStatusHeader({ t }: { t: (key: string) => string }) {
  const user = useAuthStore((s) => s.user);
  const active = user?.netrexEnabled === true;
  const expiresAt = user?.netrexExpiresAt ?? null;
  const permanent = active && expiresAt === null;

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-3 ${
        active
          ? 'border-accent-peach/25 bg-accent-peach/[0.05]'
          : 'border-white/[0.07] bg-white/[0.02]'
      }`}
      role="status"
      aria-label={active ? t('netrex_status_active') : t('netrex_status_inactive')}
    >
      <span
        className={`inline-flex h-2 w-2 flex-shrink-0 rounded-full ${
          active ? 'bg-accent-peach shadow-[0_0_8px_rgba(252,165,165,0.7)]' : 'bg-txt-tertiary/40'
        }`}
        aria-hidden
      />
      <span
        className={`text-[12px] font-bold uppercase tracking-[0.16em] ${
          active ? 'text-accent-peach' : 'text-txt-tertiary'
        }`}
      >
        {active ? t('netrex_status_active') : t('netrex_status_inactive')}
      </span>
      {active && expiresAt !== null && (
        <span className="text-[11.5px] text-txt-secondary tabular-nums">
          {t('netrex_expires_on')} {formatDate(expiresAt)}
        </span>
      )}
      {permanent && (
        <span className="text-[11.5px] text-txt-secondary">{t('netrex_permanent')}</span>
      )}
    </div>
  );
}

// ─── Feature icons (inline, small, consistent) ──────────────────────────────

function PanelIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-txt-secondary">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-txt-secondary">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function GlowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-txt-secondary">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
    </svg>
  );
}

// ─── Feature row ────────────────────────────────────────────────────────────

function FeatureRow({
  icon,
  name,
  description,
  active,
  locked,
  onToggle,
  onConfigure,
  configureLabel,
  t,
}: {
  icon: React.ReactNode;
  name: string;
  description: string;
  active: boolean;
  locked: boolean;
  onToggle: () => void;
  onConfigure?: () => void;
  configureLabel?: string;
  t: (key: string) => string;
}) {
  return (
    <div
      className={`flex items-start gap-4 rounded-xl border px-4 py-3.5 transition-colors ${
        locked
          ? 'border-white/[0.05] bg-white/[0.01] opacity-60'
          : active
            ? 'border-accent-peach/20 bg-accent-peach/[0.04]'
            : 'border-white/[0.07] bg-white/[0.02]'
      }`}
    >
      <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-bold text-txt-primary">{name}</span>
          {active && !locked && (
            <span className="rounded border border-accent-mint/25 bg-accent-mint/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-accent-mint">
              {t('netrex_hub_state_on')}
            </span>
          )}
          {locked && (
            <span className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-txt-tertiary">
              {t('netrex_hub_locked')}
            </span>
          )}
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-txt-tertiary">{description}</p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2 pt-1">
        {!locked && onConfigure && (
          <button
            onClick={onConfigure}
            className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-semibold text-txt-secondary transition-colors hover:bg-white/[0.07] hover:text-txt-primary"
          >
            {configureLabel ?? t('netrex_hub_configure')}
          </button>
        )}
        {locked ? (
          <span
            className="inline-flex h-5 w-9 items-center rounded-full bg-white/[0.06] px-0.5"
            aria-disabled
          >
            <span className="h-4 w-4 translate-x-0 rounded-full bg-txt-tertiary/50" />
          </span>
        ) : (
          <button
            onClick={onToggle}
            role="switch"
            aria-checked={active}
            aria-label={name}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
              active ? 'bg-accent-peach/70' : 'bg-white/[0.08]'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                active ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Hub ────────────────────────────────────────────────────────────────────

export function NetrexBridge() {
  const { t } = useLanguage();
  const netrexPurchaseOpen = useUIStore((s) => s.netrexPurchaseOpen);
  const setNetrexPurchaseOpen = useUIStore((s) => s.setNetrexPurchaseOpen);
  const hasLicense = useNetrexLicenseStore((s) => s.licenseKey !== null);
  // Unified tier: backend-granted Netrex OR locally verified Gumroad license.
  const isNetrex = useAuthStore((s) => s.user?.netrexEnabled === true) || hasLicense;
  useStartupLicenseRecheck();
  const activeFeatures = useNetrexPrefsStore((s) => s.activeFeatures);
  const memberPanelMode = useNetrexPrefsStore((s) => s.memberPanelMode);
  const toggleFeature = useNetrexPrefsStore((s) => s.toggleFeature);
  const setMemberPanelMode = useNetrexPrefsStore((s) => s.setMemberPanelMode);
  const openModal = useUIStore((s) => s.openModal);
  // Was advanced personalization configured at least once? Reflected in the
  // row state so "Configurar → guardar" visibly changes the hub.
  const personalizationConfigured = useMemo(
    () => typeof localStorage !== 'undefined' && localStorage.getItem(NETREX_PREFS_KEY) !== null,
    []
  );

  const featureState = (id: NetrexFeatureId) =>
    isNetrex && activeFeatures.includes(id);

  const features: {
    id: NetrexFeatureId;
    icon: React.ReactNode;
    nameKey: string;
    descKey: string;
    onConfigure?: () => void;
    configureLabel?: string;
    configured?: boolean;
  }[] = [
    {
      id: 'activityMemberPanel',
      icon: <PanelIcon />,
      nameKey: 'netrex_hub_feature_amp_name',
      descKey: 'netrex_hub_feature_amp_desc',
      onConfigure: () => setMemberPanelMode(memberPanelMode === 'activity' ? 'standard' : 'activity'),
      configureLabel: memberPanelMode === 'activity'
        ? t('netrex_hub_amp_mode_standard')
        : t('netrex_hub_amp_mode_activity'),
    },
    {
      id: 'memberGridCompact',
      icon: <GridIcon />,
      nameKey: 'netrex_hub_feature_grid_name',
      descKey: 'netrex_hub_feature_grid_desc',
    },
    {
      id: 'profileGlow',
      icon: <GlowIcon />,
      nameKey: 'netrex_hub_feature_glow_name',
      descKey: 'netrex_hub_feature_glow_desc',
      onConfigure: () => openModal('personalization'),
      configured: personalizationConfigured,
    },
  ];

  return (
    <section className="mb-16 md:mb-20">
      {/* ── Title ── */}
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="text-[22px] font-bold tracking-[-0.02em] text-txt-primary">
          {t('netrex_hub_title')}
        </h2>
        <span className="text-[11px] text-txt-tertiary">{t('netrex_hub_subtitle')}</span>
      </div>

      {/* ── Entitlement state (from backend, not spoofable client-side) ── */}
      <HubStatusHeader t={t} />

      {/* ── Features ── */}
      <div className="mt-4 space-y-2.5">
        {features.map((f) => {
          // Personalization is "active" once the user has saved the editor at
          // least once; other features use their persisted toggle.
          const active =
            f.id === 'profileGlow'
              ? isNetrex && f.configured === true
              : featureState(f.id);
          return (
            <FeatureRow
              key={f.id}
              icon={f.icon}
              name={t(f.nameKey)}
              description={t(f.descKey)}
              active={active}
              locked={!isNetrex}
              onToggle={() => toggleFeature(f.id)}
              onConfigure={isNetrex ? f.onConfigure : undefined}
              configureLabel={f.configureLabel}
              t={t}
            />
          );
        })}
      </div>

      {/* ── Inactive helper ── */}
      {!isNetrex && (
        <div className="mt-4 flex items-center gap-3">
          <p className="text-[11.5px] text-txt-tertiary">{t('netrex_hub_locked_hint')}</p>
          <button
            type="button"
            className="shrink-0 rounded-lg border border-accent-mint/30 bg-accent-mint/5 px-3.5 py-1.5 text-[11px] font-semibold text-accent-mint transition-colors hover:bg-accent-mint/10 hover:border-accent-mint/40"
            onClick={() => setNetrexPurchaseOpen(true)}
          >
            {t('get_netrex')}
          </button>
        </div>
      )}

      {/* Purchase modal. */}
      {netrexPurchaseOpen && (
        <NetrexPurchaseModal
          isOpen={netrexPurchaseOpen}
          onClose={() => setNetrexPurchaseOpen(false)}
        />
      )}
    </section>
  );
}

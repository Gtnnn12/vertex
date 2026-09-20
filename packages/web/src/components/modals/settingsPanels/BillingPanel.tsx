import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useNetrexLicenseStore } from '../../../stores/netrexLicenseStore';
import { isElectron, getElectronAPI } from '../../../platform/platform';

/**
 * Billing tab: real plan state from the locally verified license (the same
 * store the purchase modal writes to). Key is shown masked with copy/reveal,
 * payment management opens Gumroad's purchase library in-app.
 */

/** NETREX-••••-••••-XXXX — only the last 4 characters stay visible. */
function maskKey(key: string): string {
  if (key.length <= 4) return key;
  return `NETREX-••••-••••-${key.slice(-4)}`;
}

export function BillingPanel() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const licenseKey = useNetrexLicenseStore((s) => s.licenseKey);
  const plan = useNetrexLicenseStore((s) => s.plan);
  const serverUntil = useNetrexLicenseStore((s) => s.serverUntil);
  const purchasedAt = useNetrexLicenseStore((s) => s.purchasedAt);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  // Server-confirmed entitlement (webhook) or a locally verified gift key.
  const hasPlan = licenseKey !== null;
  const isSubscription = plan === 'monthly' || plan === 'sixMonths' || plan === 'yearly';
  const isLifetime = plan === 'lifetime';

  const handleCopy = async () => {
    if (!licenseKey) return;
    try {
      await navigator.clipboard.writeText(licenseKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard denied — silently ignore.
    }
  };

  const handleManagePayment = () => {
    // In-app child window (900x760, modal, parent) — Gumroad's purchase
    // library where the buyer can change card and cancel the monthly plan.
    if (isElectron() && getElectronAPI()?.openNetrexBilling) {
      void getElectronAPI()!.openNetrexBilling();
    } else {
      window.open('https://gumroad.com/library', '_blank', 'noopener');
    }
  };

  // Real date: server entitlement end when present, else the gift-key purchase.
  const activeUntil = serverUntil ?? purchasedAt;
  const purchasedDate = activeUntil
    ? new Date(activeUntil).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  return (
    <div className="max-w-[640px] mx-auto">
      <h2 className="text-lg font-semibold text-txt-primary">{t('billing_title')}</h2>
      <p className="mt-1 text-[13px] text-txt-tertiary">{t('billing_subtitle')}</p>

      {/* ── Plan state ── */}
      <section className="mt-6 rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-txt-tertiary">
              {t('billing_plan_label')}
            </p>
            {hasPlan ? (
              <p className="mt-1.5 text-[16px] font-semibold text-netrex">
                {plan === 'monthly' && t('billing_plan_monthly')}
                {plan === 'sixMonths' && t('billing_plan_six_months')}
                {plan === 'yearly' && t('billing_plan_yearly')}
                {isLifetime && t('billing_plan_lifetime')}
              </p>
            ) : (
              <p className="mt-1.5 text-[16px] font-semibold text-txt-secondary">
                {t('billing_plan_none')}
              </p>
            )}
          </div>
          {isLifetime && (
            <span className="rounded-full border border-netrex/40 bg-netrex/10 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-netrex">
              {t('billing_permanent_badge')}
            </span>
          )}
          {isSubscription && purchasedDate && (
            <span className="rounded-full border border-netrex/40 bg-netrex/10 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-netrex tabular-nums">
              {t('billing_until')} {purchasedDate}
            </span>
          )}
        </div>
        {hasPlan && purchasedDate && (
          <p className="mt-2 text-[12px] text-txt-tertiary">
            {t('billing_purchased_on')} {purchasedDate}
          </p>
        )}
        {!hasPlan && (
          <>
            <p className="mt-2 text-[12px] text-txt-tertiary">{t('billing_no_plan_hint')}</p>
            <button
              type="button"
              onClick={() => navigate('/netrex')}
              className="mt-3 rounded-lg bg-netrex px-4 py-2 text-[12.5px] font-bold text-black transition-colors hover:bg-netrex/90"
            >
              {t('billing_no_plan_cta')}
            </button>
          </>
        )}
      </section>

      {/* ── License key ── */}
      {hasPlan && licenseKey && (
        <section className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-txt-tertiary">
            {t('billing_license_key')}
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg border border-white/10 bg-[#0a0a0a] px-3 py-2 font-mono text-[12.5px] tracking-[0.08em] text-txt-primary">
              {revealed ? licenseKey : maskKey(licenseKey)}
            </code>
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              aria-label={revealed ? t('billing_hide_key') : t('billing_reveal_key')}
              className="rounded-lg border border-white/10 p-2 text-txt-tertiary transition-colors hover:border-white/25 hover:text-txt-secondary"
            >
              {revealed ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="flex-shrink-0 rounded-lg border border-white/10 px-3 py-2 text-[11.5px] font-semibold text-txt-secondary transition-colors hover:border-white/25 hover:text-txt-primary"
            >
              {copied ? t('billing_copied') : t('billing_copy_key')}
            </button>
          </div>
        </section>
      )}

      {/* ── Payment method / management ── */}
      {hasPlan && (
        <section className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-txt-tertiary">
            {t('billing_payment_method')}
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13.5px] text-txt-secondary">{t('billing_payment_note')}</p>
            <button
              type="button"
              onClick={handleManagePayment}
              className="rounded-lg border border-white/10 px-3.5 py-2 text-[12px] font-semibold text-txt-secondary transition-colors hover:border-white/25 hover:text-txt-primary"
            >
              {t('billing_manage_payment')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

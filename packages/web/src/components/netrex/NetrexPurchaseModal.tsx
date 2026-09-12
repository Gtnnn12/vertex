import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useLanguage } from '../../contexts/LanguageContext';
import { isElectron, getElectronAPI } from '../../platform/platform';
import { useNetrexLicenseStore, refreshNetrexEntitlement, type NetrexPlan } from '../../stores/netrexLicenseStore';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { SuccessOverlay } from './SuccessOverlay';

// ─── State machine ──────────────────────────────────────────────────────────
// closed → browsing → checkout-window → waiting → verifying → success
//                                                    ↘ error-inline → waiting
type PurchaseState =
  | 'browsing'
  | 'checkout-window'
  | 'waiting'
  | 'verifying'
  | 'success';

/**
 * Checkout URLs for the plain-browser fallback (no Electron bridge). Single
 * source alongside packages/desktop/src/config.ts — keep both in sync.
 */
const WEB_CHECKOUT_URLS: Record<'monthly' | 'sixMonths' | 'yearly', string> = {
  monthly: 'https://aceptado.gumroad.com/l/dztpfu',
  sixMonths: 'https://aceptado.gumroad.com/l/kwuyu',
  yearly: 'https://aceptado.gumroad.com/l/zfjzsm',
};

/** Map a main-process license error to a user-facing i18n key. */
function errorKey(error: string | undefined): string {
  switch (error) {
    case 'refunded':
      return 'netrex_license_error_refunded';
    case 'uses_exceeded':
      return 'netrex_license_error_uses_exceeded';
    case 'network':
      return 'netrex_license_error_network';
    case 'server':
      return 'netrex_license_error_server';
    default:
      return 'netrex_license_error_invalid';
  }
}

function formatKeyInput(raw: string): string {
  // Keep only hex-ish digits, uppercase, max 16, dashes every 4 → XXXX-XXXX-XXXX-XXXX
  const digits = raw.replace(/[^0-9A-Fa-f]/g, '').slice(0, 16).toUpperCase();
  const parts: string[] = [];
  for (let i = 0; i < digits.length; i += 4) parts.push(digits.slice(i, i + 4));
  return parts.join('-');
}

const FEATURES = [
  'netrex_upgrade_feature_forever',
  'netrex_upgrade_feature_priority',
  'netrex_upgrade_feature_signature',
  'netrex_upgrade_feature_early',
  'netrex_upgrade_feature_support',
] as const;

interface NetrexPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** DEV: show the SuccessOverlay without a real purchase. */
  onDevPreview?: () => void;
  /** Fired once in the success path so the sidebar NETREX chip can pulse green. */
  onActivationFlash?: () => void;
}

export function NetrexPurchaseModal({
  isOpen,
  onClose,
  onDevPreview,
  onActivationFlash,
}: NetrexPurchaseModalProps) {
  const { t } = useLanguage();
  const prefersReduced = useReducedMotion();
  const activateLicense = useNetrexLicenseStore((s) => s.activate);
  const triggerNetrexFlash = useUIStore((s) => s.triggerNetrexFlash);

  const [state, setState] = useState<PurchaseState>('browsing');
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'sixMonths' | 'yearly'>('yearly');
  const [checking, setChecking] = useState(false);
  const [showGiftKey, setShowGiftKey] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0); // bump to retrigger the shake
  const [overlayActive, setOverlayActive] = useState(false);

  // Which plans have a real checkout URL (from desktop config via IPC)?
  // Unconfigured plans render disabled with a "Próximamente" badge.
  const [plansConfig, setPlansConfig] = useState<Record<string, boolean>>({
    monthly: true,
    sixMonths: true,
    yearly: true,
  });

  const inputRef = useRef<HTMLInputElement>(null);

  const formatted = useMemo(() => formatKeyInput(keyInput), [keyInput]);
  const keyZoneOpen = state === 'waiting' || state === 'verifying';

  // Reset whenever the modal closes.
  useEffect(() => {
    if (!isOpen) {
      setState('browsing');
      setKeyInput('');
      setKeyError(null);
      setOverlayActive(false);
    }
  }, [isOpen]);

  // Load per-plan checkout configuration when the modal opens (Electron only;
  // the plain-browser fallback always has a working monthly URL hardcoded).
  useEffect(() => {
    if (!isOpen || !isElectron()) return;
    getElectronAPI()
      ?.netrexPlansConfig()
      .then((rows) => {
        const map: Record<string, boolean> = {};
        for (const r of rows) map[r.plan] = r.configured;
        setPlansConfig(map);
      })
      .catch(() => undefined);
  }, [isOpen]);

  // Esc closes — except while verifying or during the success overlay.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state !== 'verifying' && !overlayActive) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, state, overlayActive, onClose]);

  // ── In-app checkout (Electron main opens the child BrowserWindow) ──
  // The account email is pre-filled when Gumroad honours ?email= — the user
  // MUST pay with the same email as their Vertex account so the webhook can
  // match the sale to the user.
  const handleBuy = useCallback(async () => {
    setKeyError(null);
    const email = useAuthStore.getState().user?.username
      ? `${useAuthStore.getState().user!.username}@vertex.local`
      : null;
    console.log('[buy 1/3 renderer] click plan=', selectedPlan, 'email=', email, 'isElectron=', isElectron());

    if (isElectron() && getElectronAPI()?.openNetrexCheckoutWithEmail) {
      setState('checkout-window');
      try {
        const res = await getElectronAPI()!.openNetrexCheckoutWithEmail(selectedPlan, email);
        console.log('[buy 1/3 renderer] main responded:', JSON.stringify(res));
        if (res && res.ok === false) {
          // Never die silently: tell the user exactly what is missing.
          setKeyError(
            res.error === 'missing_url'
              ? t('netrex_purchase_missing_url')
              : t('netrex_purchase_no_window'),
          );
          setShakeKey((k) => k + 1);
          setState('browsing');
          return;
        }
      } catch {
        // window failed to open — fall through anyway
        console.error('[buy 1/3 renderer] checkout IPC threw — falling back');
      }
    } else {
      // Plain browser: no Electron bridge. Guarantee something visible — open
      // the selected plan's product URL in a new tab (single config source).
      const url = WEB_CHECKOUT_URLS[selectedPlan];
      console.log('[buy 1/3 renderer] no Electron bridge — opening web fallback URL:', url);
      window.open(url, '_blank', 'noopener');
    }
    // After the payment window closes, poll the server entitlement (the
    // Gumroad ping should already have landed). Key zone stays secondary.
    setState('waiting');
    void refreshNetrexEntitlement();
  }, [selectedPlan, t]);

  // ── "Ya pagué — comprobar": poll the server entitlement on demand ──
  const handleCheckEntitlement = useCallback(async () => {
    setChecking(true);
    const ent = await refreshNetrexEntitlement();
    setChecking(false);
    if (ent?.active) {
      setState('success');
      setOverlayActive(true);
      triggerNetrexFlash();
    } else {
      setKeyError(t('netrex_purchase_not_yet'));
      setShakeKey((k) => k + 1);
    }
  }, [t, triggerNetrexFlash]);

  // ── License activation ──
  const handleActivate = useCallback(async () => {
    const digits = keyInput.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
    if (digits.length !== 16) {
      setKeyError(t('netrex_upgrade_confirm_error'));
      setShakeKey((k) => k + 1);
      return;
    }
    if (!isElectron() || !getElectronAPI()?.activateNetrexLicense) {
      // Non-Electron (plain browser): license verification lives in the
      // desktop main process — say so instead of a misleading network error.
      setKeyError(t('netrex_license_desktop_only'));
      setShakeKey((k) => k + 1);
      return;
    }
    setKeyError(null);
    setState('verifying');
    console.log('[license-ipc 1/3 renderer] click → calling preload activateNetrexLicense, key len:', digits.length);
    try {
      const result = await getElectronAPI()!.activateNetrexLicense(digits);
      console.log('[license-ipc 1/3 renderer] result:', JSON.stringify(result));
      if (result.ok) {
        activateLicense(result.licenseKey ?? digits, result.purchasedAt, result.plan);
        setState('success');
        setOverlayActive(true);
        triggerNetrexFlash(); // one-shot green pulse on the sidebar chip
      } else {
        setKeyError(t(errorKey(result.error)));
        setShakeKey((k) => k + 1);
        setState('waiting');
      }
    } catch (err) {
      console.error('[license-ipc 1/3 renderer] IPC threw:', err);
      setKeyError(t('netrex_license_error_network'));
      setShakeKey((k) => k + 1);
      setState('waiting');
    }
  }, [keyInput, t, activateLicense, triggerNetrexFlash]);

  const handleOverlayDone = useCallback(() => {
    setOverlayActive(false);
    onClose();
  }, [onClose]);

  const handleDevPreview = useCallback(() => {
    if (onDevPreview) {
      onDevPreview();
      return;
    }
    // Fallback dev path: fake activation and run the overlay.
    activateLicense('A1B2C3D4E5F60708');
    setOverlayActive(true);
  }, [onDevPreview, activateLicense]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="backdrop"
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.18, ease: 'easeIn' } }}
          transition={{ duration: 0.2 }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Fixed-value blur layer — only its opacity animates. */}
          <motion.div
            className="absolute inset-0 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.18, ease: 'easeIn' } }}
            transition={{ duration: 0.2 }}
          />

          {/* Card. */}
          <motion.div
            className="relative w-full max-w-[460px] rounded-2xl border border-white/10 bg-[#0d0d0d] p-8 shadow-2xl"
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.18, ease: 'easeIn' } }}
            transition={{
              opacity: { duration: 0.2 },
              scale: { type: 'spring', stiffness: 220, damping: 24 },
              y: { type: 'spring', stiffness: 220, damping: 24 },
            }}
          >
            {/* Close X. */}
            <button
              type="button"
              onClick={onClose}
              disabled={state === 'verifying' || state === 'success'}
              className="absolute right-4 top-4 p-1 text-white/40 transition-colors hover:text-white disabled:opacity-30"
              aria-label={t('close')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z" />
              </svg>
            </button>

            {/* Badge. */}
            <span className="inline-flex items-center rounded-full border border-netrex/30 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-netrex">
              {t('netrex_purchase_badge')}
            </span>

            {/* Title + subtitle. */}
            <h2 className="mt-4 text-[26px] font-bold leading-tight tracking-[-0.02em] text-white">
              {t('netrex_purchase_title')}
            </h2>
            <p className="mt-1 text-[13px] text-white/50">
              {t('netrex_purchase_plan_pick')}
            </p>

            {/* Plan selector — three subscription cards, selected framed green. */}
            <div className="mt-5 grid grid-cols-3 gap-2.5" role="radiogroup" aria-label={t('netrex_purchase_plan_pick')}>
              {(
                [
                  {
                    id: 'monthly' as const,
                    configured: plansConfig.monthly !== false,
                    label: t('netrex_plan_monthly'),
                    price: '€6',
                    suffix: t('netrex_plan_per_month'),
                    note: null,
                  },
                  {
                    id: 'sixMonths' as const,
                    configured: plansConfig.sixMonths !== false,
                    label: t('netrex_plan_six_months'),
                    price: '€20',
                    suffix: t('netrex_plan_per_six_months'),
                    note: null,
                  },
                  {
                    id: 'yearly' as const,
                    configured: plansConfig.yearly !== false,
                    label: t('netrex_plan_yearly'),
                    price: '€40',
                    suffix: t('netrex_plan_per_year'),
                    note: 'best',
                  },
                ]
              ).map((plan) => {
                const selected = selectedPlan === plan.id;
                return (
                  <motion.button
                    key={plan.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-disabled={!plan.configured}
                    onClick={() => plan.configured && setSelectedPlan(plan.id)}
                    // Micro-interaction: the selected card springs in 0.98 → 1.
                    animate={selected && !prefersReduced ? { scale: 1 } : { scale: selected ? 1 : undefined }}
                    initial={{ scale: 0.98 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                    className={`relative rounded-xl border p-4 text-left transition-colors ${
                      !plan.configured
                        ? 'cursor-not-allowed border-white/5 bg-white/[0.01] opacity-45'
                        : selected
                          ? 'border-netrex bg-netrex/[0.06]'
                          : 'border-white/10 bg-white/[0.02] hover:border-white/25'
                    }`}
                  >
                    {!plan.configured ? (
                      <span className="absolute -top-2.5 right-2 rounded-full border border-white/15 bg-[#161616] px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-white/50">
                        {t('netrex_plan_coming_soon')}
                      </span>
                    ) : plan.note === 'best' && (
                      <span className="absolute -top-2.5 right-2 rounded-full bg-netrex px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-black">
                        {t('netrex_plan_best_value')}
                      </span>
                    )}
                    <span className={`font-mono text-[10px] font-bold uppercase tracking-[0.16em] ${selected ? 'text-netrex' : 'text-white/45'}`}>
                      {plan.label}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5">
                      <span className="text-[28px] font-bold tracking-tight text-white">{plan.price}</span>
                      <span className="text-[12px] text-white/50">{plan.suffix}</span>
                    </span>
                    <span className="mt-1 block text-[11px] text-white/40">
                      {plan.note ?? ''}
                    </span>
                  </motion.button>
                );
              })}
            </div>

            {/* Features with staggered check entrance. */}
            <ul className="mt-6 space-y-3">
              {FEATURES.map((featureKey, i) => (
                <motion.li
                  key={featureKey}
                  className="flex items-start gap-3"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: prefersReduced ? 0 : 0.15 + i * 0.05,
                    duration: 0.3,
                    ease: 'easeOut',
                  }}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mt-0.5 shrink-0 text-netrex"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span className="text-[13px] leading-relaxed text-white/70">
                    {t(featureKey)}
                  </span>
                </motion.li>
              ))}
            </ul>

            {/* Email match warning — the webhook matches by payment email. */}
            <p className="mt-6 rounded-lg border border-netrex/25 bg-netrex/[0.06] px-3 py-2 text-center text-[11.5px] font-medium text-netrex">
              {t('netrex_purchase_email_match')}
            </p>

            {/* CTA. */}
            <motion.button
              type="button"
              className="mt-3 h-12 w-full rounded-xl bg-white text-[14px] font-semibold text-black disabled:opacity-60"
              whileHover={prefersReduced ? undefined : { y: -2 }}
              whileTap={prefersReduced ? undefined : { scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25 }}
              onClick={handleBuy}
              disabled={state === 'checkout-window' || state === 'verifying' || state === 'success'}
            >
              {state === 'checkout-window'
                ? t('netrex_purchase_checkout_open')
                : selectedPlan === 'yearly'
                  ? t('netrex_purchase_cta_yearly')
                  : selectedPlan === 'sixMonths'
                    ? t('netrex_purchase_cta_six_months')
                    : t('netrex_purchase_cta_monthly')}
            </motion.button>

            {/* "Ya pagué — comprobar": poll the server entitlement. */}
            {state === 'waiting' && (
              <motion.button
                type="button"
                className="mt-2.5 h-10 w-full rounded-xl border border-netrex/40 bg-netrex/10 text-[13px] font-semibold text-netrex transition-colors hover:bg-netrex/20 disabled:opacity-60"
                onClick={handleCheckEntitlement}
                disabled={checking}
              >
                {checking ? t('netrex_purchase_checking') : t('netrex_purchase_already_paid')}
              </motion.button>
            )}

            {/* Gift-key path — secondary, collapsed by default. */}
            <button
              type="button"
              onClick={() => setShowGiftKey((v) => !v)}
              className="mt-4 w-full text-center text-[11.5px] text-white/40 transition-colors hover:text-white/70"
            >
              {showGiftKey ? '▾' : '▸'} {t('netrex_purchase_gift_key_toggle')}
            </button>

            {/* Collapsed gift-key zone — grid-rows 0fr → 1fr. */}
            <div
              className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                (keyZoneOpen || showGiftKey) ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
              }`}
            >
              <div className="overflow-hidden">
                <div className="pt-4">
                  <p className="text-[11px] text-white/40">
                    {t('netrex_upgrade_confirm_expanded')}
                  </p>

                  <div className="mt-2 flex gap-2">
                    <motion.div
                      className="flex-1"
                      animate={keyError ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
                      transition={{ duration: 0.35 }}
                      key={shakeKey}
                    >
                      <input
                        ref={inputRef}
                        type="text"
                        inputMode="text"
                        autoComplete="off"
                        spellCheck={false}
                        maxLength={19}
                        value={formatted}
                        disabled={state === 'verifying'}
                        onChange={(e) => {
                          setKeyError(null);
                          setKeyInput(e.target.value);
                        }}
                        placeholder="XXXX-XXXX-XXXX-XXXX"
                        aria-label={t('netrex_upgrade_confirm_input_placeholder')}
                        className={`w-full rounded-lg border bg-[#0a0a0a] px-3 py-2.5 text-center font-mono text-[13px] uppercase tracking-[0.2em] text-white placeholder:text-white/25 focus:outline-none focus:ring-1 disabled:opacity-50 ${
                          keyError
                            ? 'border-red-500/80 ring-red-500/30'
                            : 'border-white/10 hover:border-white/20 focus:border-netrex/60 focus:ring-netrex/30'
                        }`}
                      />
                    </motion.div>
                    <button
                      type="button"
                      onClick={handleActivate}
                      disabled={state === 'verifying'}
                      className="flex flex-shrink-0 items-center justify-center gap-2 rounded-lg bg-netrex px-4 py-2.5 text-[12px] font-bold text-black transition-colors hover:bg-netrex/90 disabled:opacity-60"
                    >
                      {state === 'verifying' && (
                        <svg
                          className="h-3.5 w-3.5 animate-spin"
                          viewBox="0 0 24 24"
                          fill="none"
                          aria-hidden
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-90"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                          />
                        </svg>
                      )}
                      {t('netrex_upgrade_confirm_submit')}
                    </button>
                  </div>

                  {/* Inline error (with shake + red border above). */}
                  <AnimatePresence>
                    {keyError && (
                      <motion.p
                        className="mt-2 text-[11.5px] text-red-400"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        role="alert"
                      >
                        {keyError}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </motion.div>

          {/* DEV: overlay preview trigger. */}
          {import.meta.env.DEV && (
            <button
              type="button"
              className="fixed bottom-4 left-1/2 z-[120] -translate-x-1/2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] text-white/60 transition-colors hover:bg-white/10"
              onClick={handleDevPreview}
            >
              {t('netrex_upgrade_preview')}
            </button>
          )}

          <SuccessOverlay active={overlayActive} onDone={handleOverlayDone} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

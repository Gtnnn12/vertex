import React, { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import {
  useMusicWidgetStore,
  useMusicStyleForSelf,
} from '../../stores/musicWidgetStore';
import {
  MUSIC_STYLES,
  MUSIC_STYLE_DEMO_TRACK,
  getMusicStyle,
  resolveMusicStyle,
  type MusicStyleId,
} from '../../spotify/musicStyles';
import { MusicDisc } from '../../spotify/MusicDisc';
import { SpotifyCard } from '../spotify/SpotifyVinyl';

/**
 * Netrex hub — "Estilos de caja musical" (shop-window redesign).
 *
 * PLACEMENT: rendered by NetrexBridge AFTER the features list — it is the
 * sales showcase, not a buried setting.
 *
 * - Uniform animated mini-previews (same stage height for all 8), badge as a
 *   small solid chip in the corner (NEVER over the preview content), full
 *   titles (never truncated), one-line descriptions with elegant ellipsis.
 * - Locked styles: soft dark overlay — the animation stays visible behind —
 *   plus a small lock; applying is gated (toast + CTA), previewing is free.
 * - BIG sticky live preview on the side: the real card at natural size,
 *   changing in real time while browsing, WITHOUT saving.
 * - Apply / Reset buttons. Entry staggers at 60–80 ms. Selection logic,
 *   entitlement and persistence are untouched.
 */

const STAGGER_MS = 70;

function LockGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function CheckGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

/** Uniform animated mini-preview stage — same height for all 8 styles. */
function StyleMiniPreview({ id, accent }: { id: MusicStyleId; accent: string }): React.ReactElement {
  return (
    <div
      className="pointer-events-none relative flex h-[120px] w-full items-center justify-center overflow-hidden rounded-lg border border-white/[0.05] bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.04),transparent_70%)]"
      style={{ '--vinyl-glow': accent } as React.CSSProperties}
      aria-hidden
    >
      {/* 96px disc in a 120px stage: every variant renders complete, uniform. */}
      <div style={{ transform: 'scale(0.92)', transformOrigin: 'center' }}>
        <MusicDisc style={id} spotify={MUSIC_STYLE_DEMO_TRACK} glow={accent} compact={false} />
      </div>
    </div>
  );
}

export function MusicStylePicker(): React.ReactElement {
  const { t } = useLanguage();
  const prefersReduced = useReducedMotion();
  const isNetrex = useAuthStore((s) => s.user?.netrexEnabled ?? false);
  const setNetrexPurchaseOpen = useUIStore((s) => s.setNetrexPurchaseOpen);
  const addToast = useUIStore((s) => s.addToast);

  const savedStyle = useMusicStyleForSelf();
  const selectStyle = useMusicWidgetStore((s) => s.selectStyle);
  const saving = useMusicWidgetStore((s) => s.saving);
  const setPreviewStyle = useMusicWidgetStore((s) => s.setPreviewStyle);

  // Browsing selection (big preview). Never persisted; cleared on unmount.
  const [browsing, setBrowsing] = useState<MusicStyleId | null>(null);
  useEffect(() => () => setPreviewStyle(null), [setPreviewStyle]);

  const effective = browsing ?? resolveMusicStyle(savedStyle, isNetrex);
  const effectiveEntry = useMemo(() => getMusicStyle(effective), [effective]);

  const choose = (id: MusicStyleId) => {
    const entry = getMusicStyle(id);
    // Live preview ALWAYS updates — locked styles are the shop window.
    setBrowsing(id);
    setPreviewStyle(id);
    if (entry.requiresNetrex && !isNetrex) {
      addToast(t('music_style_cta_locked'), 'warning', 4200);
    }
  };

  const apply = async () => {
    if (!browsing) return;
    const entry = getMusicStyle(browsing);
    if (entry.requiresNetrex && !isNetrex) {
      addToast(t('music_style_cta_locked'), 'warning', 4200);
      return;
    }
    try {
      await selectStyle(browsing);
      addToast(t('music_style_applied'), 'success', 2600);
      setBrowsing(null);
    } catch {
      addToast(t('music_style_apply_failed'), 'warning', 3600);
    }
  };

  const reset = async () => {
    try {
      await selectStyle('vinyl');
      addToast(t('music_style_reset_toast'), 'success', 2600);
      setBrowsing(null);
    } catch {
      addToast(t('music_style_apply_failed'), 'warning', 3600);
    }
  };

  const dirty = browsing !== null && browsing !== resolveMusicStyle(savedStyle, isNetrex);
  const canApply = browsing !== null && (!getMusicStyle(browsing).requiresNetrex || isNetrex);

  // HONEST STATE: a premium style selected while the front's cached user lacks
  // the entitlement must NOT silently disable Apply — the server is the
  // authority and accepts permanent grants. Surface the reason instead.
  const blockedByEntitlement = browsing !== null && getMusicStyle(browsing).requiresNetrex && !isNetrex;

  return (
    <section className="mb-16 md:mb-20">
      {/* ── Premium section header: eyebrow + title + subtitle + hairline ── */}
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-accent-peach">✦</span>
        <span className="h-px flex-1 bg-gradient-to-r from-white/[0.08] to-transparent" />
      </div>
      <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-[26px] font-bold tracking-[-0.02em] text-txt-primary">
          {t('music_styles_head_title')}
        </h2>
        <p className="text-[12.5px] text-txt-tertiary">{t('music_styles_head_subtitle')}</p>
      </div>

      <div className="mt-7 grid grid-cols-1 items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(380px,460px)] xl:gap-10">
        {/* ── Style grid: 4 / 2 / 1 columns, equal-height cards, generous gap ── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-5">
          {MUSIC_STYLES.map((entry, i) => {
            const locked = entry.requiresNetrex && !isNetrex;
            const isCurrent = !browsing && entry.id === resolveMusicStyle(savedStyle, isNetrex);
            const isBrowsing = browsing === entry.id;
            return (
              <motion.button
                key={entry.id}
                type="button"
                initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
                animate={prefersReduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * (STAGGER_MS / 1000), ease: [0.33, 1, 0.68, 1] }}
                whileHover={prefersReduced ? undefined : { y: -3 }}
                onClick={() => choose(entry.id)}
                className={`group relative flex h-full flex-col rounded-2xl border p-3 text-left transition-all duration-200 ${
                  isBrowsing
                    ? 'border-accent-peach/50 bg-accent-peach/[0.06] shadow-[0_0_0_1px_rgba(252,165,165,0.25),0_10px_32px_-14px_rgba(252,165,165,0.35)]'
                    : isCurrent
                      ? 'border-accent-mint/35 bg-accent-mint/[0.04]'
                      : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.035] hover:shadow-[0_10px_28px_-16px_rgba(0,0,0,0.7)]'
                }`}
                aria-pressed={isBrowsing}
              >
                {/* Preview stage — badge never sits over the animation content
                    center; the chip is a small solid corner overlay. */}
                <div className="relative">
                  <StyleMiniPreview id={entry.id} accent={entry.accent} />

                  {/* FREE/NETREX chip — solid bg + hairline border, legible. */}
                  <span
                    className={`absolute right-2 top-2 rounded-md border px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.14em] backdrop-blur-sm ${
                      entry.requiresNetrex
                        ? 'border-accent-peach/35 bg-[#1a1214]/90 text-accent-peach'
                        : 'border-accent-mint/30 bg-[#0f1613]/90 text-accent-mint'
                    }`}
                  >
                    {entry.requiresNetrex ? t('music_style_netrex') : t('music_style_free')}
                  </span>

                  {/* Selected check — accent chip, top-left corner. */}
                  {isBrowsing && (
                    <span className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent-peach text-black shadow-[0_2px_8px_rgba(252,165,165,0.45)]">
                      <CheckGlyph className="h-3 w-3" />
                    </span>
                  )}

                  {/* Locked: SOFT dark overlay — the animation stays visible
                      behind — plus a small lock; hover shows the CTA hint. */}
                  {locked && (
                    <span
                      className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 rounded-lg bg-black/40 transition-colors duration-200 group-hover:bg-black/30"
                      aria-hidden
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.14] bg-black/60 text-white/75">
                        <LockGlyph className="h-3.5 w-3.5" />
                      </span>
                      <span className="max-w-[90%] truncate rounded-md border border-accent-mint/30 bg-black/80 px-2 py-0.5 text-[9px] font-semibold text-accent-mint opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                        {t('music_style_unlock')}
                      </span>
                    </span>
                  )}
                </div>

                {/* Text — full name (wraps, never truncated), one-line desc
                    with elegant ellipsis + title on hover. */}
                <div className="mt-3 min-w-0">
                  <span className="block text-[12.5px] font-bold leading-tight text-txt-primary">
                    {t(entry.nameKey)}
                  </span>
                  <p className="mt-1 truncate text-[10.5px] leading-snug text-txt-tertiary" title={t(entry.descKey)}>
                    {t(entry.descKey)}
                  </p>
                  {isCurrent && (
                    <span className="mt-1.5 inline-block rounded border border-accent-mint/25 bg-accent-mint/10 px-1.5 py-px text-[8.5px] font-bold uppercase tracking-wide text-accent-mint">
                      {t('music_style_current')}
                    </span>
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* ── BIG sticky live preview — the sales panel ── */}
        <motion.aside
          initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
          animate={prefersReduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.08, ease: [0.33, 1, 0.68, 1] }}
          className="h-fit overflow-visible rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6 shadow-[0_16px_48px_-24px_rgba(0,0,0,0.8)] xl:sticky xl:top-6"
        >
          <div className="mb-4 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-peach" aria-hidden />
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-txt-tertiary">
              {t('music_style_preview_label')}
            </span>
            <span className="ml-auto truncate text-[12px] font-semibold text-txt-primary">
              {t(effectiveEntry.nameKey)}
            </span>
          </div>

          {/* Mock of the real profile surface — the REAL SpotifyCard at its
              NATURAL size. The container grows to fit the card (no crop, no
              fixed height, no overflow clipping). */}
          <div className="w-full">
            <SpotifyCard spotify={MUSIC_STYLE_DEMO_TRACK} style={effective} />
          </div>

          {/* Featured actions */}
          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={apply}
              disabled={!dirty || !canApply || saving}
              className={`flex-1 rounded-xl px-5 py-3 text-[13px] font-bold transition-all duration-200 ${
                canApply && dirty
                  ? 'bg-accent-peach/85 text-black shadow-[0_6px_20px_-8px_rgba(252,165,165,0.55)] hover:bg-accent-peach hover:shadow-[0_8px_26px_-8px_rgba(252,165,165,0.7)]'
                  : 'cursor-not-allowed border border-white/[0.08] bg-white/[0.03] text-txt-tertiary'
              }`}
            >
              {saving ? t('music_style_applying') : t('music_style_apply')}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={saving || resolveMusicStyle(savedStyle, isNetrex) === 'vinyl'}
              className="rounded-xl border border-white/[0.09] bg-white/[0.03] px-5 py-3 text-[13px] font-semibold text-txt-secondary transition-colors duration-200 hover:bg-white/[0.07] hover:text-txt-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('music_style_reset')}
            </button>
          </div>
          {browsing && blockedByEntitlement && (
            <button
              type="button"
              onClick={() => setNetrexPurchaseOpen(true)}
              className="mt-3 w-full rounded-xl border border-accent-mint/30 bg-accent-mint/5 px-3 py-2.5 text-[12px] font-semibold text-accent-mint transition-colors duration-200 hover:border-accent-mint/40 hover:bg-accent-mint/10"
            >
              {t('music_style_cta_locked')}
            </button>
          )}
        </motion.aside>
      </div>
    </section>
  );
}

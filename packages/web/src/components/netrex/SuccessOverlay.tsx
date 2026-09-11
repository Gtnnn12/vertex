import React, { useMemo, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useLanguage } from '../../contexts/LanguageContext';

/** Signature ease: cubic-bezier(0.16, 1, 0.3, 1). */
const EASE = [0.16, 1, 0.3, 1] as const;

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function formatDate(ts: number) {
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

interface Particle {
  id: number;
  angle: number;
  distance: number;
  size: number;
  delay: number;
}

/** Deterministic burst particles: dist in [min,max], per-particle stagger. */
function makeParticles(
  count: number,
  minDist: number,
  maxDist: number,
  seed: number,
  stagger: number,
): Particle[] {
  const rng = seededRandom(seed);
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: i,
      angle: rng() * Math.PI * 2,
      distance: minDist + rng() * (maxDist - minDist),
      size: 1 + rng() * 1,
      delay: i * stagger,
    });
  }
  return out;
}

// PERF budget: 20 + 14 + 24 rects (static ring) + 18 ambient dots — all
// transform/opacity only, never boxShadow/filter per frame.
const GREEN_PARTICLES = makeParticles(20, 90, 160, 7, 0.015);
const WHITE_PARTICLES = makeParticles(14, 60, 120, 42, 0.015);

interface SuccessOverlayProps {
  active: boolean;
  /** Called when the timeline finishes (~3.8s) or the user hits Continuar. */
  onDone: () => void;
}

export function SuccessOverlay({ active, onDone }: SuccessOverlayProps) {
  const { t } = useLanguage();
  const prefersReduced = useReducedMotion();

  const licenseRaw = useMemo(() => {
    try {
      return localStorage.getItem('vertex.netrex.license') ?? '';
    } catch {
      return '';
    }
  }, []);
  const licenseMasked = useMemo(() => {
    const raw = licenseRaw.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    const last4 = raw.slice(-4).padEnd(4, '•');
    return `••••-••••-••••-${last4}`;
  }, [licenseRaw]);
  const verifiedLine = useMemo(() => {
    const formatted = formatDate(Date.now());
    if (!formatted) return t('netrex_purchase_verified_on');
    return t('netrex_purchase_verified_on').replace('{date}', formatted);
  }, [t]);

  useEffect(() => {
    if (!active) return;
    if (prefersReduced) {
      // Reduced motion: simple fades, ~1s total.
      const timeout = setTimeout(onDone, 1600);
      return () => clearTimeout(timeout);
    }
    const timeout = setTimeout(onDone, 3800);
    return () => clearTimeout(timeout);
  }, [active, prefersReduced, onDone]);

  if (!active) return null;

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: prefersReduced ? 1 : 0.25 }}
    >
      {/* ── z:0 dim — static blur, opacity only ─────────────────────────── */}
      <motion.div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: prefersReduced ? 1 : 0.25 }}
      />

      {/* ── z:1 ambient floating dots (loop 4–6s, transform+opacity) ────── */}
      {!prefersReduced && (
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {Array.from({ length: 18 }).map((_, i) => {
            const size = 1 + (i % 2);
            return (
              <motion.div
                key={`amb-${i}`}
                className="absolute rounded-full bg-white"
                style={{
                  width: size,
                  height: size,
                  left: `${(4 + (i * 5.3) % 92)}%`,
                  bottom: '-6px',
                  willChange: 'transform, opacity',
                }}
                initial={{ opacity: 0 }}
                animate={{
                  y: [-20 - (i % 4) * 8, -300 - (i % 6) * 20],
                  opacity: [0, 0.12, 0],
                }}
                transition={{
                  duration: 4 + (i % 3),
                  repeat: Infinity,
                  delay: 1.6 + i * (6 / 18),
                  ease: 'easeInOut',
                }}
              />
            );
          })}
        </div>
      )}

      {/* Center rig — shared screen-shake container (z:2..6 live inside). */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        style={{ willChange: 'transform' }}
        animate={
          prefersReduced
            ? undefined
            : { x: [0, -2, 2, -1, 1, 0], y: [0, -2, 2, -1, 1, 0] }
        }
        transition={{ delay: 0.85, duration: 0.22, ease: 'easeInOut' }}
      >
        {/* ── z:2 glow ──────────────────────────────────────────────────── */}
        <motion.div
          className="absolute rounded-full bg-netrex/25"
          style={{ width: 220, height: 220, willChange: 'transform, opacity' }}
          initial={{ scale: 0.8, opacity: 0.3 }}
          animate={prefersReduced ? { scale: 1, opacity: 0.4 } : { scale: 1.3, opacity: [0.3, 0.7, 0.4] }}
          transition={{ delay: 0.35, duration: 0.7, ease: EASE }}
        />

        {/* ── z:3 shockwaves ────────────────────────────────────────────── */}
        {!prefersReduced && (
          <>
            <motion.div
              className="absolute rounded-full border-2 border-netrex/50"
              style={{ width: 80, height: 80, willChange: 'transform, opacity' }}
              initial={{ scale: 0.5, opacity: 1 }}
              animate={{ scale: 3.5, opacity: 0 }}
              transition={{ delay: 0.2, duration: 0.9, ease: EASE }}
            />
            <motion.div
              className="absolute rounded-full border border-white/20"
              style={{ width: 80, height: 80, willChange: 'transform, opacity' }}
              initial={{ scale: 0.5, opacity: 0.6 }}
              animate={{ scale: 3.5, opacity: 0 }}
              transition={{ delay: 0.35, duration: 0.9, ease: EASE }}
            />
          </>
        )}

        {/* ── z:4 bursts (rotate container for the confetti ring) ───────── */}
        {!prefersReduced && (
          <motion.div
            className="absolute"
            style={{ width: 320, height: 320, willChange: 'transform' }}
            initial={{ rotate: 0 }}
            animate={{ rotate: 180 }}
            transition={{ delay: 1.0, duration: 2.5, ease: EASE }}
          >
            {GREEN_PARTICLES.map((p) => {
              const xEnd = Math.cos(p.angle) * p.distance;
              const yEnd = Math.sin(p.angle) * p.distance + 40; // gravity
              return (
                <motion.div
                  key={`g-${p.id}`}
                  className="absolute rounded-full bg-netrex"
                  style={{
                    width: p.size,
                    height: p.size,
                    left: 160,
                    top: 160,
                    willChange: 'transform, opacity',
                  }}
                  initial={{ x: 0, y: 0, scale: 1, opacity: 0 }}
                  animate={{
                    x: xEnd,
                    y: yEnd,
                    scale: [1, 0.6, 0],
                    opacity: [0, 1, 1, 0.6, 0],
                  }}
                  transition={{ delay: 0.85 + p.delay, duration: 1.3, ease: 'easeOut' }}
                />
              );
            })}
            {WHITE_PARTICLES.map((p) => {
              const xEnd = Math.cos(p.angle) * p.distance;
              const yEnd = Math.sin(p.angle) * p.distance + 40;
              return (
                <motion.div
                  key={`w-${p.id}`}
                  className="absolute rounded-full bg-white"
                  style={{
                    width: p.size,
                    height: p.size,
                    left: 160,
                    top: 160,
                    willChange: 'transform, opacity',
                  }}
                  initial={{ x: 0, y: 0, scale: 1, opacity: 0 }}
                  animate={{
                    x: xEnd,
                    y: yEnd,
                    scale: [1, 0.6, 0],
                    opacity: [0, 1, 1, 0.6, 0],
                  }}
                  transition={{ delay: 0.92 + p.delay, duration: 1.1, ease: 'easeOut' }}
                />
              );
            })}
            {/* Confetti ring: 24 static 2×8 rects at radius 70, counter-fading. */}
            {Array.from({ length: 24 }).map((_, i) => {
              const a = (i / 24) * Math.PI * 2;
              return (
                <motion.div
                  key={`c-${i}`}
                  className="absolute rounded-sm bg-netrex"
                  style={{
                    width: 2,
                    height: 8,
                    left: 160 + Math.cos(a) * 70 - 1,
                    top: 160 + Math.sin(a) * 70 - 4,
                    transform: 'rotate(45deg)',
                    willChange: 'opacity',
                  }}
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 0 }}
                  transition={{ delay: 1.0, duration: 1.2, ease: 'easeOut' }}
                />
              );
            })}
          </motion.div>
        )}

        {/* ── z:5 circle + check ────────────────────────────────────────── */}
        <motion.div
          className="absolute flex items-center justify-center rounded-full border-2 border-netrex bg-netrex/10"
          style={{ width: 80, height: 80, willChange: 'transform' }}
          initial={{ scale: 0.6 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 260, damping: 22 }}
        >
          <CheckGlyph delay={0.4} ghostOpacity={1} />
          {!prefersReduced && <CheckGlyph delay={0.43} ghostOpacity={0.15} />}
          {!prefersReduced && <CheckGlyph delay={0.46} ghostOpacity={0.08} />}
        </motion.div>

        {/* ── z:6 flash ─────────────────────────────────────────────────── */}
        {!prefersReduced && (
          <motion.div
            className="pointer-events-none absolute inset-0 bg-white"
            style={{ willChange: 'opacity' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.18, 0] }}
            transition={{ delay: 0.85, duration: 0.2, times: [0, 0.4, 1], ease: 'linear' }}
          />
        )}
      </motion.div>

      {/* ── z:7 card ────────────────────────────────────────────────────── */}
      <motion.div
        className="relative w-full max-w-[360px] overflow-hidden rounded-xl border border-white/10 bg-[#111] p-5"
        style={{ perspective: 600, transformOrigin: '50% 100%', willChange: 'transform' }}
        initial={{ rotateX: -35, scale: 0.92, y: 24, opacity: 0 }}
        animate={{ rotateX: 0, scale: 1, y: 0, opacity: 1 }}
        transition={
          prefersReduced
            ? { duration: 0.5 }
            : { delay: 1.2, type: 'spring', stiffness: 180, damping: 20, mass: 0.9 }
        }
      >
        {/* shine sweep at 1.45 — translateX + opacity only. */}
        {!prefersReduced && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <motion.div
              className="absolute left-0 top-0 h-full w-[120px] skew-x-[12deg]"
              style={{
                background:
                  'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0) 100%)',
              }}
              initial={{ x: -120, opacity: 0 }}
              animate={{ x: 380, opacity: 1 }}
              transition={{ delay: 1.45, duration: 0.7, ease: EASE }}
            />
          </div>
        )}

        <div className="relative">
          {/* badge — 1.9 */}
          <motion.div
            className="mb-3 flex items-center justify-center"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: prefersReduced ? 0 : 1.9, duration: 0.4, ease: EASE }}
          >
            <span className="inline-flex h-6 items-center rounded-full border border-netrex/30 bg-netrex/10 px-3 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-netrex">
              {t('netrex_purchase_badge')}
            </span>
          </motion.div>

          {/* title — 1.9 */}
          <motion.h3
            className="text-center text-xl font-bold tracking-[-0.02em] text-white"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: prefersReduced ? 0 : 1.9, duration: 0.45, ease: EASE }}
          >
            {t('netrex_purchase_upgrade_title')}
          </motion.h3>

          {/* license row — 2.1 */}
          <motion.div
            className="mt-4 flex items-center justify-between text-[11px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: prefersReduced ? 0.1 : 2.1, duration: 0.4 }}
          >
            <span className="uppercase tracking-[0.18em] text-white/40">
              {t('netrex_upgrade_success_license_label')}
            </span>
            <span className="font-mono text-[12px] tabular-nums tracking-[0.12em] text-white">
              {licenseMasked}
            </span>
          </motion.div>

          {/* verified row — 2.1 */}
          <motion.div
            className="mt-2 flex items-center justify-between text-[11px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: prefersReduced ? 0.1 : 2.1, duration: 0.4 }}
          >
            <span className="uppercase tracking-[0.18em] text-white/40">
              {t('netrex_upgrade_success_verified')}
            </span>
            <span className="text-[12px] tabular-nums text-white/70">{verifiedLine}</span>
          </motion.div>

          <p className="mt-4 text-center text-[11.5px] leading-relaxed text-white/45">
            {t('netrex_upgrade_success_confirmation_hint')}
          </p>

          {/* continue button — 2.8, z:8 */}
          <motion.button
            className="mt-5 w-full rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-white/90 active:bg-white/80"
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: prefersReduced ? 0.4 : 2.8, duration: 0.4, ease: EASE }}
            onClick={onDone}
          >
            {t('netrex_purchase_upgrade_button')}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** SVG check with stroke-dash draw-on + optional ghost echo. */
function CheckGlyph({ delay, ghostOpacity }: { delay: number; ghostOpacity: number }) {
  return (
    <svg
      width="42"
      height="42"
      viewBox="0 0 42 42"
      fill="none"
      stroke="white"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={ghostOpacity === 1 ? undefined : ghostOpacity}
      aria-hidden
      style={ghostOpacity === 1 ? undefined : { position: 'absolute', left: 0, top: 0 }}
    >
      <motion.path
        d="M12 22l7 7 13-13"
        initial={{ strokeDashoffset: 1, pathLength: 1 }}
        animate={{ strokeDashoffset: 0 }}
        transition={{ delay, duration: 0.55, ease: EASE }}
        style={{ strokeDasharray: '1' }}
      />
    </svg>
  );
}

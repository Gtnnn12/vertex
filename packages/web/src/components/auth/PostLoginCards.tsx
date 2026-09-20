import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';

/**
 * VERTEX "poker cards" post-login overlay.
 *
 * Sequence (total ~2.1s, driven by the phase state machine below):
 *  1. DEAL    — 6 cards fan in from the bottom with staggered springs.
 *  2. SHUFFLE — two pairs of cards swap positions with spring arcs.
 *  3. STACK   — every card flies to the center, one by one.
 *  4. FLIP    — the top card flips in 3D revealing the VERTEX logo + username.
 *  5. FADE    — the whole overlay fades out and calls onDone.
 *
 * Safety: NEVER blocks access. Any render error, missing APIs or the
 * watchdog timeout hands control back to the app. Under
 * prefers-reduced-motion the whole thing is a simple 300ms fade.
 */

const CARD_COUNT = 6;

interface PostLoginCardsProps {
  /** Display name to reveal on the front face. */
  displayName: string;
  /** Called exactly once when the overlay finishes (or aborts). */
  onDone: () => void;
  /** Testing / preview hook: speeds everything up. */
  fast?: boolean;
}

type Phase = 'deal' | 'shuffle' | 'stack' | 'flip' | 'fade';

const T = (fast?: boolean) => ({
  deal: fast ? 250 : 700,
  shuffle: fast ? 200 : 550,
  stack: fast ? 150 : 450,
  flip: fast ? 120 : 350,
});

export function PostLoginCards({ displayName, onDone, fast }: PostLoginCardsProps) {
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>('deal');
  const doneRef = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const finish = React.useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }, [onDone]);

  useEffect(() => {
    const t = T(fast);
    const schedule = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));

    if (reducedMotion) {
      // Reduced motion: brief fade only.
      schedule(fast ? 60 : 300, () => setPhase('fade'));
      schedule(fast ? 200 : 650, finish);
    } else {
      schedule(t.deal, () => setPhase('shuffle'));
      schedule(t.deal + t.shuffle, () => setPhase('stack'));
      schedule(t.deal + t.shuffle + t.stack, () => setPhase('flip'));
      schedule(t.deal + t.shuffle + t.stack + t.flip + (fast ? 250 : 900), () => setPhase('fade'));
      schedule(t.deal + t.shuffle + t.stack + t.flip + (fast ? 450 : 1200), finish);
    }
    // Watchdog: no matter what, never block the app for more than 4s (250ms fast).
    const watchdog = setTimeout(finish, fast ? 250 : 4000);

    return () => {
      timers.current.forEach(clearTimeout);
      clearTimeout(watchdog);
    };
  }, [reducedMotion, finish, fast]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = T(fast);

  // Deterministic shuffle choreography (same every run — it's a ritual, not a lottery)
  const swaps = [
    { a: 1, b: 4 },
    { a: 0, b: 3 },
    { a: 2, b: 5 },
  ];

  return (
    <AnimatePresence>
      {phase !== 'fade' || !reducedMotion ? (
        <motion.div
          key="overlay"
          data-testid="post-login-cards"
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 50% 45%, rgb(var(--surface-base-rgb, 12 12 18) / 0.97), rgb(var(--surface-base-rgb, 12 12 18) / 0.99))',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0.3 : 0.35, ease: 'easeOut' }}
          onAnimationComplete={(def) => {
            // exit animation finished → hand over to the app
            if ((def as { opacity?: number }).opacity === 0) finish();
          }}
        >
          <div
            className="relative"
            style={{ width: 300, height: 220, perspective: 1200 }}
            data-testid="cards-stage"
          >
            {Array.from({ length: CARD_COUNT }, (_, i) => {
              const isTop = i === CARD_COUNT - 1;
              // Fan layout: arc from left to right
              const fanX = (i - (CARD_COUNT - 1) / 2) * 34;
              const fanRot = (i - (CARD_COUNT - 1) / 2) * 7;
              // Shuffle target: the card this one swaps with
              const swap = swaps.find((s) => s.a === i);
              const swapBack = swaps.find((s) => s.b === i);
              const shuffleX = swap
                ? (swap.b - (CARD_COUNT - 1) / 2) * 34 - fanX
                : swapBack
                  ? (swapBack.a - (CARD_COUNT - 1) / 2) * 34 - fanX
                  : 0;

              // Final stack: everything centered
              const stacked = phase === 'stack' || phase === 'flip';

              return (
                <motion.div
                  key={i}
                  className="absolute left-1/2 top-1/2"
                  style={{
                    width: 92,
                    height: 132,
                    marginLeft: -46,
                    marginTop: -66,
                    transformStyle: 'preserve-3d',
                    zIndex: isTop ? 20 : i,
                  }}
                  initial={{
                    opacity: 0,
                    x: fanX * 0.4,
                    y: 320,
                    rotate: fanRot,
                  }}
                  animate={
                    phase === 'deal'
                      ? { opacity: 1, x: fanX, y: 0, rotate: fanRot }
                      : phase === 'shuffle'
                        ? { opacity: 1, x: fanX + shuffleX, y: -6, rotate: shuffleX * 0.25 }
                        : stacked
                          ? { opacity: 1, x: 0, y: -i * 1.5, rotate: 0 }
                          : { opacity: 1, x: fanX, y: 0, rotate: fanRot }
                  }
                  transition={
                    phase === 'stack' && !isTop
                      ? { type: 'spring', stiffness: 260, damping: 24, delay: (CARD_COUNT - 1 - i) * 0.06 }
                      : { type: 'spring', stiffness: 190, damping: 20 }
                  }
                >
                  {/* Card with two faces — flip only applies to the top card */}
                  <motion.div
                    className="relative h-full w-full"
                    style={{ transformStyle: 'preserve-3d' }}
                    animate={{ rotateY: isTop && phase === 'flip' ? 180 : 0 }}
                    transition={{ duration: fast ? 0.25 : 0.55, ease: [0.4, 0, 0.2, 1] }}
                  >
                    {/* ── BACK FACE (VERTEX pattern) ── */}
                    <div
                      className="absolute inset-0 rounded-xl border overflow-hidden"
                      style={{
                        backfaceVisibility: 'hidden',
                        borderColor: 'rgb(var(--accent-primary-rgb, 124 108 246) / 0.35)',
                        background:
                          'linear-gradient(150deg, rgb(var(--surface-elevated-rgb, 24 24 32) / 1), rgb(var(--surface-elevated-rgb, 24 24 32) / 0.92))',
                        boxShadow: '0 12px 34px rgb(0 0 0 / 0.45)',
                      }}
                    >
                      {/* corner pips */}
                      <div
                        className="absolute inset-0 opacity-[0.16]"
                        style={{
                          backgroundImage:
                            'radial-gradient(2px 2px at 14% 12%, rgb(var(--accent-primary-rgb, 124 108 246) / 1) 50%, transparent 51%), radial-gradient(2px 2px at 86% 12%, rgb(var(--accent-primary-rgb, 124 108 246) / 1) 50%, transparent 51%), radial-gradient(2px 2px at 14% 88%, rgb(var(--accent-primary-rgb, 124 108 246) / 1) 50%, transparent 51%), radial-gradient(2px 2px at 86% 88%, rgb(var(--accent-primary-rgb, 124 108 246) / 1) 50%, transparent 51%)',
                        }}
                      />
                      {/* center V mark */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span
                          className="text-2xl font-bold tracking-[0.14em] select-none"
                          style={{ color: 'rgb(var(--accent-primary-rgb, 124 108 246) / 0.8)' }}
                        >
                          V
                        </span>
                      </div>
                      {/* hairline frame */}
                      <div
                        className="absolute inset-[6px] rounded-lg border"
                        style={{ borderColor: 'rgb(var(--accent-primary-rgb, 124 108 246) / 0.22)' }}
                      />
                    </div>

                    {/* ── FRONT FACE (logo + name) ── */}
                    <div
                      className="absolute inset-0 rounded-xl border flex flex-col items-center justify-center gap-2 overflow-hidden"
                      style={{
                        backfaceVisibility: 'hidden',
                        transform: 'rotateY(180deg)',
                        borderColor: 'rgb(var(--accent-primary-rgb, 124 108 246) / 0.45)',
                        background:
                          'linear-gradient(160deg, rgb(var(--accent-primary-rgb, 124 108 246) / 0.14), rgb(var(--surface-elevated-rgb, 24 24 32) / 1) 55%)',
                        boxShadow: '0 12px 34px rgb(0 0 0 / 0.45)',
                      }}
                    >
                      <span
                        className="text-lg font-bold tracking-[0.2em] uppercase"
                        style={{ color: 'rgb(var(--text-primary-rgb, 239 239 244) / 1)' }}
                      >
                        Vertex
                      </span>
                      <div
                        className="w-8 h-px"
                        style={{ background: 'rgb(var(--accent-primary-rgb, 124 108 246) / 0.6)' }}
                      />
                      <span
                        className="text-sm font-medium max-w-[80px] truncate"
                        style={{ color: 'rgb(var(--text-secondary-rgb, 160 160 175) / 1)' }}
                      >
                        {displayName}
                      </span>
                    </div>
                  </motion.div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

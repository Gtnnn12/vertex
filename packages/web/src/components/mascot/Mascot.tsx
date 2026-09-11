import React, { useEffect, useState } from 'react';

export type MascotState =
  | 'idle'
  | 'focus'
  | 'typing'
  | 'password'
  | 'show-password'
  | 'loading'
  | 'error'
  | 'success'
  | 'startup';

interface MascotProps {
  state?: MascotState;
  className?: string;
  /** Normalized cursor gaze, -1..1 on both axes. Subtle, eased; ignored under reduced motion. */
  gaze?: { x: number; y: number };
}

/**
 * VERTEX login mascot. Renders a small animated SVG face whose expression is
 * derived from the login form state passed via `state`.
 *
 * Idle life: a re-seeding timer re-randomizes blink cadence, breathing sway and
 * antenna bob every few seconds so the loop never reads as a perfect GIF.
 * All animation is SMIL/CSS inline and disabled under `prefers-reduced-motion`
 * (only non-essential, minimal transitions remain).
 */
export function Mascot({ state = 'idle', className, gaze }: MascotProps) {
  const [reducedMotion, setReducedMotion] = useState(false);
  // Re-seeded periodically to vary idle animation timing.
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setPhase((p) => p + 1);
        schedule();
      }, 2800 + Math.random() * 2600);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [reducedMotion]);

  const text = 'rgb(var(--text-secondary) / 1)';

  // Deterministic pseudo-random variation per phase (stable within a render).
  const r = (n: number, min: number, span: number) => min + ((phase * 7919 + n * 104729) % 1000) / 1000 * span;

  // ── Gaze (subtle pupil offset, eased via CSS transition) ────────────────
  const gx = !reducedMotion && gaze ? Math.max(-1, Math.min(1, gaze.x)) * 1.4 : 0;
  const gy = !reducedMotion && gaze ? Math.max(-1, Math.min(1, gaze.y)) * 1.2 : 0;
  const gazeStyle: React.CSSProperties = {
    transform: `translate(${gx.toFixed(2)}px, ${gy.toFixed(2)}px)`,
    transition: reducedMotion ? 'none' : 'transform 500ms cubic-bezier(0.22, 1, 0.36, 1)',
  };

  // ── Reusable animated pieces ────────────────────────────────────────────

  /** Gentle vertical breathing with per-phase amplitude/duration variation. */
  const breath = () =>
    reducedMotion ? null : (
      <animateTransform
        attributeName="transform"
        type="translate"
        values={`0 0; 0 ${(-r(1, 0.7, 0.9)).toFixed(2)}; 0 0`}
        dur={`${r(2, 3.6, 1.8).toFixed(2)}s`}
        repeatCount="indefinite"
        additive="sum"
      />
    );

  /** Blink: eye scaleY collapse, per-phase randomized cadence so blinks feel organic. */
  const blink = (durOverride?: number) =>
    reducedMotion ? null : (
      <animateTransform
        attributeName="transform"
        type="scale"
        values="1 1; 1 0.08; 1 1"
        keyTimes="0; 0.5; 1"
        dur={`${durOverride ?? r(3, 2.6, 2.4).toFixed(2)}s`}
        repeatCount="indefinite"
        calcMode="discrete"
        additive="sum"
      />
    );

  // Eye shapes — pupils wrapped in a gaze group with eased CSS transform.
  const openEye = (cx: number, cy: number, r = 4, anim: React.ReactNode = null) => (
    <g transform={`translate(${cx} ${cy})`}>
      <g style={gazeStyle}>
        <circle cx="0" cy="0" r={r} fill={text} />
        {anim}
      </g>
    </g>
  );

  /** ^ ^ happy closed eyes (success) */
  const happyEye = (cx: number, cy: number) => (
    <path
      d={`M ${cx - 4} ${cy + 1.5} Q ${cx} ${cy - 3.5} ${cx + 4} ${cy + 1.5}`}
      fill="none"
      stroke={text}
      strokeWidth="2"
      strokeLinecap="round"
    />
  );

  /** ─ ─ closed / resting eyes (password) */
  const closedEye = (cx: number, cy: number) => (
    <line x1={cx - 4} y1={cy} x2={cx + 4} y2={cy} stroke={text} strokeWidth="2" strokeLinecap="round" />
  );

  /** ✕ ✕ eyes (error) */
  const crossEye = (cx: number, cy: number) => (
    <g stroke={text} strokeWidth="2" strokeLinecap="round">
      <line x1={cx - 3} y1={cy - 3} x2={cx + 3} y2={cy + 3} />
      <line x1={cx + 3} y1={cy - 3} x2={cx - 3} y2={cy + 3} />
    </g>
  );

  // Mouths
  const smile = (
    <path d="M 21 34 Q 28 40 35 34" fill="none" stroke={text} strokeWidth="2" strokeLinecap="round" />
  );
  const smallSmile = (
    <path d="M 23 34 Q 28 37 33 34" fill="none" stroke={text} strokeWidth="2" strokeLinecap="round" />
  );
  const neutral = (
    <line x1="23" y1="35" x2="33" y2="35" stroke={text} strokeWidth="2" strokeLinecap="round" />
  );
  const frown = (
    <path d="M 22 37 Q 28 32 34 37" fill="none" stroke={text} strokeWidth="2" strokeLinecap="round" />
  );
  const openMouth = (
    <ellipse cx="28" cy="35.5" rx="3.5" ry="4" fill={text} />
  );
  const bigSmile = (
    <path d="M 20 33 Q 28 42 36 33 Z" fill="none" stroke={text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  );

  const eyeY = 24;
  // Error shake: two quick cycles, then settles — never loops indefinitely.
  const shake = reducedMotion ? null : (
    <animateTransform
      attributeName="transform"
      type="translate"
      values="0 0; -1.8 0; 1.8 0; -1.4 0; 1.4 0; 0 0"
      dur="0.4s"
      repeatCount="2"
      additive="sum"
    />
  );
  const spin = reducedMotion ? null : (
    <animateTransform
      attributeName="transform"
      type="rotate"
      from="0 28 28"
      to="360 28 28"
      dur="1.4s"
      repeatCount="indefinite"
      additive="sum"
    />
  );

  // Typing bounce: small, quick head bob synced to active typing.
  const typingBob = reducedMotion ? null : (
    <animateTransform
      attributeName="transform"
      type="translate"
      values="0 0; 0 -1.5; 0 0"
      dur="0.5s"
      repeatCount="indefinite"
      additive="sum"
    />
  );

  const faces: Record<MascotState, React.ReactNode> = {
    idle: (
      <g>
        {openEye(19, eyeY, 4, blink())}
        {openEye(37, eyeY, 4, blink())}
        {smile}
        {breath()}
      </g>
    ),
    focus: (
      <g>
        {openEye(19, eyeY, 4, blink(r(4, 3.5, 3)))}
        {openEye(37, eyeY, 4, blink(r(4, 3.5, 3)))}
        {neutral}
        {breath()}
      </g>
    ),
    typing: (
      <g>
        {openEye(19, eyeY - 1, 3.4, blink(1.8))}
        {openEye(37, eyeY - 1, 3.4, blink(1.8))}
        {openMouth}
        {typingBob}
      </g>
    ),
    password: (
      <g>
        {closedEye(19, eyeY)}
        {closedEye(37, eyeY)}
        {neutral}
        <circle cx="14" cy="31" r="2" fill={text} opacity="0.35" />
        <circle cx="42" cy="31" r="2" fill={text} opacity="0.35" />
        {/* shy paws rising to cover the eyes while typing the password */}
        <g className={reducedMotion ? undefined : 'vertex-mascot-hands'}>
          <rect x="10" y={eyeY - 7} width="17" height="13" rx="6" fill={text} opacity="0.92" />
          <rect x="29" y={eyeY - 7} width="17" height="13" rx="6" fill={text} opacity="0.92" />
          <line x1="15" y1={eyeY - 2} x2="15" y2={eyeY + 2} stroke="rgb(var(--surface-input) / 1)" strokeWidth="1.4" strokeLinecap="round" opacity="0.55" />
          <line x1="19" y1={eyeY - 2} x2="19" y2={eyeY + 2} stroke="rgb(var(--surface-input) / 1)" strokeWidth="1.4" strokeLinecap="round" opacity="0.55" />
          <line x1="34" y1={eyeY - 2} x2="34" y2={eyeY + 2} stroke="rgb(var(--surface-input) / 1)" strokeWidth="1.4" strokeLinecap="round" opacity="0.55" />
          <line x1="38" y1={eyeY - 2} x2="38" y2={eyeY + 2} stroke="rgb(var(--surface-input) / 1)" strokeWidth="1.4" strokeLinecap="round" opacity="0.55" />
        </g>
        {breath()}
      </g>
    ),
    'show-password': (
      <g>
        {openEye(19, eyeY, 4.8)}
        {openEye(37, eyeY, 4.8)}
        <ellipse cx="28" cy="36" rx="2.5" ry="3" fill="none" stroke={text} strokeWidth="2" />
        {!reducedMotion && (
          <animateTransform
            attributeName="transform"
            type="scale"
            values="1; 1.04; 1"
            dur="0.9s"
            repeatCount="indefinite"
            additive="sum"
          />
        )}
      </g>
    ),
    loading: (
      <g>
        <g transform="translate(19 24)">
          <path d="M 0 -4 A 4 4 0 0 1 4 0" fill="none" stroke={text} strokeWidth="2.4" strokeLinecap="round" />
        </g>
        <g transform="translate(37 24)">
          <path d="M 0 -4 A 4 4 0 0 1 4 0" fill="none" stroke={text} strokeWidth="2.4" strokeLinecap="round" />
        </g>
        {neutral}
        {spin}
      </g>
    ),
    error: (
      <g>
        {crossEye(19, eyeY)}
        {crossEye(37, eyeY)}
        {frown}
        {shake}
      </g>
    ),
    success: (
      <g>
        {happyEye(19, eyeY)}
        {happyEye(37, eyeY)}
        {bigSmile}
        {!reducedMotion && (
          <animateTransform
            attributeName="transform"
            type="scale"
            values="1; 1.06; 1"
            dur="1s"
            repeatCount="indefinite"
            additive="sum"
          />
        )}
      </g>
    ),
    startup: (
      <g>
        {openEye(19, eyeY, 4, blink())}
        {openEye(37, eyeY, 4, blink())}
        {smallSmile}
        {breath()}
      </g>
    ),
  };

  const isActive = state === 'typing' || state === 'loading' || state === 'error' || state === 'success';

  return (
    <div
      className={`relative w-20 h-20 rounded-2xl border border-white/[0.08] bg-surface-input shadow-elevation-low ${className || ''}`}
      aria-hidden="true"
    >
      {/* soft glow behind the face so it feels integrated, not pasted on */}
      <div className="absolute inset-0 rounded-2xl bg-accent-primary/[0.04] pointer-events-none" />
      <svg
        viewBox="0 0 56 56"
        width="100%"
        height="100%"
        fill="none"
        role="img"
        className="relative transition-transform duration-200"
      >
        {/* antenna: sways gently; brightens while the mascot is active */}
        <g>
          <line x1="28" y1="6" x2="28" y2="12" stroke={text} strokeWidth="2" strokeLinecap="round" opacity="0.7" />
          <circle cx="28" cy="5" r="2.2" fill={text} opacity="0.8">
            {!reducedMotion && (
              <animate
                attributeName="opacity"
                values={isActive ? '0.7;1;0.7' : '0.4;0.9;0.4'}
                dur={isActive ? '0.9s' : `${r(5, 2.2, 1.4).toFixed(2)}s`}
                repeatCount="indefinite"
              />
            )}
            {!reducedMotion && (
              <animateTransform
                attributeName="transform"
                type="translate"
                values={`0 0; ${r(6, -0.8, 1.6).toFixed(2)} 0; 0 0`}
                dur={`${r(7, 2.6, 2).toFixed(2)}s`}
                repeatCount="indefinite"
              />
            )}
          </circle>
        </g>
        {/* head outline */}
        <rect x="8" y="12" width="40" height="34" rx="12" stroke={text} strokeWidth="1.6" opacity="0.5" />
        {faces[state] ?? faces.idle}
      </svg>
    </div>
  );
}

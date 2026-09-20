import React, { useCallback, useRef, useState } from 'react';

/**
 * Shared "wow" FX for profile cards (popout + modal): tilt 3D, cursor glow
 * and banner parallax — all driven from ONE mousemove handler that writes
 * CSS custom properties consumed by the .profile-fx cabinet in globals.css.
 *
 * Purely presentational: attaches no listeners to the DOM tree beyond the
 * ref'd element and never touches app state. Fully disabled under
 * prefers-reduced-motion (the CSS cabinet also opts out — this just avoids
 * wasted work).
 *
 * Usage:
 *   const fx = useProfileCardFX();
 *   <div ref={fx.ref} className={`profile-fx fx-animatable profile-stagger ${...}`}
 *        onMouseMove={fx.onMouseMove} onMouseLeave={fx.onMouseLeave}>
 *     <span className="profile-fx-glow" aria-hidden />
 *     <div className="h-[100px] relative overflow-hidden">
 *       <div className="profile-fx-banner" style={{ backgroundImage: ... }} />
 *       <div className="profile-fx-banner-overlay" />
 *     </div>
 *     ...
 */
export function useProfileCardFX() {
  const ref = useRef<HTMLDivElement>(null);
  // Tracks whether the pointer is inside, so leave can restore transitions
  // for the smooth "return to rest" of the tilt/parallax.
  const [hovering, setHovering] = useState(false);

  const prefersReduced = () =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el || prefersReduced()) return;

    const rect = el.getBoundingClientRect();
    // Normalized cursor position: -0.5..0.5 from center.
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;

    // Tilt: max 5deg — subtle, never disorienting.
    const MAX_TILT = 5;
    el.style.setProperty('--fx-rx', `${(-ny * MAX_TILT).toFixed(2)}deg`);
    el.style.setProperty('--fx-ry', `${(nx * MAX_TILT).toFixed(2)}deg`);

    // Cursor glow anchor.
    el.style.setProperty('--fx-mx', `${e.clientX - rect.left}px`);
    el.style.setProperty('--fx-my', `${e.clientY - rect.top}px`);

    // Banner parallax: inner layer drifts ~8px against the cursor.
    el.style.setProperty('--fx-bx', `${(-nx * 16).toFixed(1)}px`);
    el.style.setProperty('--fx-by', `${(-ny * 10).toFixed(1)}px`);

    if (!hovering) setHovering(true);
  }, [hovering]);

  const onMouseLeave = useCallback(() => {
    const el = ref.current;
    setHovering(false);
    if (!el) return;
    // Return to rest — .fx-animatable's transition makes this glide.
    el.style.setProperty('--fx-rx', '0deg');
    el.style.setProperty('--fx-ry', '0deg');
    el.style.setProperty('--fx-bx', '0px');
    el.style.setProperty('--fx-by', '0px');
  }, []);

  return { ref, onMouseMove, onMouseLeave, hovering };
}

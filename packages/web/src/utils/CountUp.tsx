import React, { useEffect, useRef, useState } from 'react';

/**
 * Shared count-up number: animates current → value with an ease-out cubic.
 * Instant under prefers-reduced-motion. Purely presentational.
 */
export function CountUp({ value, duration = 700 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number | null>(null);
  const prevRef = useRef(0);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      prevRef.current = value;
      setDisplay(value);
      return;
    }
    const from = prevRef.current;
    if (from === value) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prevRef.current = value;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return <>{display}</>;
}

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { useNetrexLicenseStore } from '../../stores/netrexLicenseStore';

interface NetrexNavChipProps {
  isCurrentPage: boolean;
}

/**
 * NETREX sidebar entry. When Netrex is actually active (backend entitlement OR
 * a verified license) the chip goes live: green #57f287 text/icon with a
 * STATIC text-shadow glow (never animated per-frame), an opacity-only pulsing
 * dot (2.5s loop), a stronger glow on hover, and a one-shot ~700ms flash the
 * moment activation lands. Reduced motion: color change only.
 */
export function NetrexNavChip({ isCurrentPage }: NetrexNavChipProps) {
  const navigate = useNavigate();
  const prefersReduced = useReducedMotion();

  const netrexEnabled = useAuthStore((s) => s.user?.netrexEnabled === true);
  const licenseKey = useNetrexLicenseStore((s) => s.licenseKey);
  const licensePlan = useNetrexLicenseStore((s) => s.plan);
  const isActive = netrexEnabled || licenseKey !== null;
  // ∞ marks the permanent (lifetime) license; monthly shows plain Premium.
  const planLabel = licensePlan === 'lifetime' ? 'Premium ∞' : 'Premium';

  const flashAt = useUIStore((s) => s.netrexFlashAt);
  const [flash, setFlash] = useState(false);

  // One-shot flash when activation just happened (store timestamp changes).
  useEffect(() => {
    if (!flashAt) return;
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 700);
    return () => clearTimeout(timer);
  }, [flashAt]);

  const glow = '0 0 8px rgba(87, 242, 135, 0.65)'; // static — never animated
  const showGlow = isActive && (isCurrentPage || flash);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate('/netrex')}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate('/netrex');
        }
      }}
      aria-label="NETREX"
      className={`group flex items-center gap-2 px-2 h-[40px] rounded-[8px] cursor-pointer select-none transition-all ${
        isCurrentPage
          ? 'bg-white/[0.07] ring-1 ring-white/[0.07]'
          : 'hover:bg-white/[0.035]'
      }`}
    >
      <div
        className={`w-[28px] h-[28px] rounded-[8px] flex-shrink-0 flex items-center justify-center border transition-all duration-200 ${
          isActive && (isCurrentPage || flash)
            ? 'bg-netrex/10 border-netrex/40 group-hover:border-netrex/60'
            : isCurrentPage
              ? 'bg-accent-peach/10 border-accent-peach/25'
              : 'bg-white/[0.04] border-white/[0.07] group-hover:bg-white/[0.06] group-hover:border-white/[0.12]'
        }`}
      >
        <span
          className={`text-[11px] leading-none transition-colors duration-200 ${
            isActive
              ? 'text-netrex'
              : isCurrentPage
                ? 'text-accent-peach'
                : 'text-txt-secondary group-hover:text-accent-peach'
          }`}
          style={{ textShadow: showGlow ? glow : 'none' }}
        >
          ✦
        </span>
      </div>

      <div className="min-w-0 flex-1 flex flex-col justify-center leading-none">
        <span
          className={`text-[13px] font-bold tracking-[0.08em] transition-colors duration-200 ${
            isActive && (isCurrentPage || flash)
              ? 'text-netrex group-hover:text-netrex'
              : isCurrentPage
                ? 'text-txt-primary'
                : 'text-txt-secondary group-hover:text-txt-primary'
          }`}
          style={{ textShadow: showGlow ? glow : 'none' }}
        >
          NETREX
        </span>
        <span className={`mt-[3px] text-[9.5px] font-semibold tracking-[0.06em] ${isActive ? 'text-netrex/70' : 'text-txt-tertiary'}`}>
          {planLabel}
        </span>
      </div>

      {/* Pulsing dot — opacity-only loop, reduced-motion renders it static. */}
      {isCurrentPage && (
        <motion.span
          className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${
            isActive ? 'bg-netrex' : 'bg-accent-peach'
          }`}
          animate={
            isActive && !prefersReduced
              ? { opacity: [0.35, 1, 0.35] }
              : { opacity: 1 }
          }
          transition={
            isActive && !prefersReduced
              ? { duration: 2.5, repeat: Infinity, ease: 'easeInOut' }
              : undefined
          }
        />
      )}
    </div>
  );
}

import React from 'react';
import type { StaffRole } from '@backspace/shared';
import { useLanguage } from '../../contexts/LanguageContext';
import { Tooltip } from './Tooltip';

interface StaffBadgeProps {
  role?: StaffRole | null;
  className?: string;
  showLabel?: boolean;
}

export function StaffBadge({ role, className = '', showLabel = false }: StaffBadgeProps) {
  const { t } = useLanguage();
  if (!role) return null;

  let tooltipText = '';
  let icon: React.ReactNode = null;
  let badgeStyle = '';

  switch (role) {
    case 'owner':
      tooltipText = t('badge_owner_tooltip');
      badgeStyle = 'text-accent-rose bg-accent-rose/15 border border-accent-rose/30 shadow-[0_0_12px_-2px_rgba(244,63,94,0.35)]';
      icon = (
        <svg className="w-3 h-3 transition-transform duration-200 group-hover/badge:scale-125 group-hover/badge:-rotate-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
        </svg>
      );
      break;
    case 'administrator':
      tooltipText = t('badge_administrator_tooltip');
      badgeStyle = 'text-accent-amber bg-accent-amber/15 border border-accent-amber/30 shadow-[0_0_12px_-2px_rgba(245,158,11,0.35)]';
      icon = (
        <svg className="w-3 h-3 transition-transform duration-200 group-hover/badge:scale-125" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
        </svg>
      );
      break;
    case 'developer':
      tooltipText = t('badge_developer_tooltip');
      badgeStyle = 'text-accent-lavender bg-accent-lavender/15 border border-accent-lavender/30 shadow-[0_0_12px_-2px_rgba(196,181,253,0.35)]';
      icon = (
        <svg className="w-3 h-3 transition-transform duration-200 group-hover/badge:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      );
      break;
    case 'senior_moderator':
    case 'moderator':
      tooltipText = role === 'senior_moderator' ? t('badge_senior_moderator_tooltip') : t('badge_moderator_tooltip');
      badgeStyle = 'text-accent-mint bg-accent-mint/15 border border-accent-mint/30 shadow-[0_0_12px_-2px_rgba(130,239,172,0.35)]';
      icon = (
        <svg className="w-3 h-3 transition-transform duration-200 group-hover/badge:scale-110" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z" />
        </svg>
      );
      break;
    case 'support':
      tooltipText = t('badge_staff_tooltip');
      badgeStyle = 'text-accent-sky bg-accent-sky/15 border border-accent-sky/30 shadow-[0_0_12px_-2px_rgba(125,211,252,0.35)]';
      icon = (
        <svg className="w-3 h-3 transition-transform duration-200 group-hover/badge:scale-110" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
        </svg>
      );
      break;
    default:
      tooltipText = t('badge_staff_tooltip');
      badgeStyle = 'text-accent-sky bg-accent-sky/15 border border-accent-sky/30';
      icon = (
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="6" />
        </svg>
      );
  }

  const badgeContent = (
    <span
      className={`group/badge inline-flex items-center justify-center transition-all duration-200 cursor-default select-none
        hover:scale-110 hover:-translate-y-0.5 hover:brightness-125 hover:shadow-[0_2px_8px_-1px_rgba(0,0,0,0.4)]
        focus-visible:scale-110 focus-visible:outline-none
        ${
        showLabel
          ? `gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase ${badgeStyle}`
          : `w-4 h-4 rounded-md p-0.5 ${badgeStyle}`
      } ${className}`}
      role="img"
      aria-label={tooltipText}
      title={tooltipText}
      tabIndex={0}
    >
      {icon}
      {showLabel && <span>{t(`staff_badge_${role}`)}</span>}
    </span>
  );

  return (
    <Tooltip content={tooltipText} position="top" delay={150}>
      {badgeContent}
    </Tooltip>
  );
}

export function NetrexChip({ active = true, className = '', showLabel = false }: { active?: boolean; className?: string; showLabel?: boolean }) {
  const { t } = useLanguage();
  if (!active) return null;

  const tooltipText = t('badge_netrex_tooltip');
  const badgeStyle = 'text-accent-peach bg-accent-peach/15 border border-accent-peach/30 shadow-[0_0_14px_-2px_rgba(252,165,165,0.45)]';

  const badgeContent = (
    <span
      className={`group/badge inline-flex items-center justify-center transition-all duration-200 cursor-default select-none
        hover:scale-110 hover:-translate-y-0.5 hover:brightness-125 hover:shadow-[0_2px_10px_-1px_rgba(252,165,165,0.5)]
        focus-visible:scale-110 focus-visible:outline-none
        ${
        showLabel
          ? `gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${badgeStyle}`
          : `w-4 h-4 rounded-md p-0.5 ${badgeStyle}`
      } ${className}`}
      role="img"
      aria-label={tooltipText}
      title={tooltipText}
      tabIndex={0}
    >
      <svg className="w-3 h-3 transition-transform duration-200 group-hover/badge:rotate-45 group-hover/badge:scale-125" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l2.4 6.8 6.8 2.4-6.8 2.4L12 20.4l-2.4-6.8-6.8-2.4 6.8-2.4L12 2z" />
      </svg>
      {showLabel && <span>NETREX</span>}
    </span>
  );

  return (
    <Tooltip content={tooltipText} position="top" delay={150}>
      {badgeContent}
    </Tooltip>
  );
}

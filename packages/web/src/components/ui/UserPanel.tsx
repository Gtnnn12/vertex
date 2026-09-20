import React, { useEffect, useRef } from 'react';
import type { User } from '@backspace/shared';
import { useSetPresence } from '../../hooks/usePresence';
import { useLanguage } from '../../contexts/LanguageContext';
import { PRESENCE_META, PRESENCE_ORDER } from '../../utils/presence';
import { CustomStatusBubble } from './CustomStatusBubble';
import { Avatar } from './Avatar';

interface UserPanelProps {
  user: User;
  anchor: { x: number; y: number };
  onClose: () => void;
  onEditProfile: () => void;
}

/**
 * Discord-style user panel, anchored above the bottom-left avatar: mini
 * profile (banner, ringed avatar, name, @handle, custom-status bubble),
 * a controls row (mic / headphones / settings — wired only when the voice
 * handlers are provided) and the four presence states.
 *
 * Status switching goes through useSetPresence → WS `presence_update` on all
 * connected origins + optimistic writes to auth/social/space stores.
 * Closes on outside click and Escape; 120ms fade+scale entrance, fully
 * disabled under prefers-reduced-motion (see .user-panel-in in globals.css).
 */
export function UserPanel({ user, anchor, onClose, onEditProfile }: UserPanelProps) {
  const { t } = useLanguage();
  const setPresence = useSetPresence();
  const ref = useRef<HTMLDivElement>(null);

  // Outside click + Escape
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  // Flip above the anchor; clamp horizontally into the viewport.
  const PANEL_WIDTH = 300;
  const left = Math.max(8, Math.min(anchor.x, window.innerWidth - PANEL_WIDTH - 8));
  const style: React.CSSProperties = { left, bottom: window.innerHeight - anchor.y + 8 };

  const displayName = user.displayName ?? user.username;
  const bannerSrc = user.banner
    ? (user.banner.startsWith('http') || user.banner.startsWith('/') ? user.banner : `/api/uploads/${user.banner}`)
    : null;

  return (
    <div
      ref={ref}
      data-user-panel
      className="user-panel-in fixed z-[220] w-[300px] rounded-[12px] overflow-hidden bg-surface-elevated border border-white/[0.08] shadow-[0_12px_36px_-8px_rgba(0,0,0,0.55)]"
      style={style}
      role="menu"
    >
      {/* Mini banner — falls back to nothing (flat surface) when unset. */}
      <div className="h-[60px] bg-white/[0.04]">
        {bannerSrc && (
          <img src={bannerSrc} alt="" className="w-full h-full object-cover" draggable={false} />
        )}
      </div>

      {/* Identity — avatar overlaps the banner edge, Discord-style. */}
      <div className="px-3 pb-3">
        <div className="-mt-6 mb-2 inline-block rounded-full border-4 border-surface-elevated">
          <Avatar
            src={user.avatar ?? undefined}
            name={displayName}
            size={52}
            status={user.status as 'online' | 'idle' | 'dnd' | 'offline' | null}
            userId={user.homeUserId ?? user.id}
            avatarColor={user.avatarColor}
          />
        </div>
        <div className="text-[15px] font-semibold text-txt-primary leading-tight truncate">{displayName}</div>
        <div className="text-[11.5px] text-txt-tertiary truncate">@{user.username}</div>
        <CustomStatusBubble status={user.customStatus} />
      </div>

      {/* Controls row — mic/headphones disabled (voice store wiring is the
          sidebar's job; here they're placeholders marked coming soon). */}
      <div className="px-3 pb-2 flex items-center gap-1.5">
        <button
          disabled
          title={t('coming_soon')}
          className="w-8 h-8 flex items-center justify-center rounded-[8px] text-txt-tertiary/50 bg-white/[0.04] cursor-not-allowed"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        </button>
        <button
          disabled
          title={t('coming_soon')}
          className="w-8 h-8 flex items-center justify-center rounded-[8px] text-txt-tertiary/50 bg-white/[0.04] cursor-not-allowed"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3c-4.97 0-9 4.03-9 9v7c0 1.1.9 2 2 2h2v-7H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-2v7h2c1.1 0 2-.9 2-2v-7c0-4.97-4.03-9-9-9z" />
          </svg>
        </button>
        <div className="flex-1" />
        <button
          onClick={onEditProfile}
          className="px-2.5 h-8 flex items-center rounded-[8px] text-[12px] font-medium text-txt-secondary hover:text-txt-primary bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
        >
          {t('edit_profile')}
        </button>
      </div>

      <div className="mx-3 border-t border-white/[0.06]" />

      {/* Presence states — WS presence_update + optimistic store writes. */}
      <div className="p-1.5">
        {PRESENCE_ORDER.map((status) => {
          const meta = PRESENCE_META[status];
          const active = (user.status ?? 'online') === status;
          return (
            <button
              key={status}
              role="menuitemradio"
              aria-checked={active}
              onClick={() => {
                setPresence(status);
                onClose();
              }}
              className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-[8px] text-left transition-colors ${
                active ? 'bg-white/[0.06] text-txt-primary' : 'text-txt-secondary hover:bg-white/[0.04] hover:text-txt-primary'
              }`}
            >
              <span
                aria-hidden
                className="w-2.5 h-2.5 rounded-full border-2 border-[var(--surface-elevated)] flex-shrink-0"
                style={{ backgroundColor: meta.hex }}
              />
              <span className="text-[13px] font-medium flex-1">{t(meta.labelKey)}</span>
              {active && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-txt-secondary">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

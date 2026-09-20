import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Avatar } from './Avatar';
import { CustomStatusBubble } from './CustomStatusBubble';
import { getAvatarGradient, adjustColor, mutedGradient } from '../../utils/gradients';
import { useLanguage } from '../../contexts/LanguageContext';
import { useProfileCardFX } from './useProfileCardFX';
import { profileTint } from '../../utils/profileTint';

/**
 * The single source of truth for the profile identity card visual — banner,
 * ringed avatar, name, @username, custom status and markdown bio. Both the
 * live preview in user settings and the real UserProfilePopout render through
 * this component, so the two can never drift apart.
 *
 * VERTEX identity (deliberately NOT the Discord layout): layered depth —
 * banner with a gradient overlay melting into the card surface, avatar
 * wrapped in a breathing presence ring, name paired with a monospace-style
 * @handle chip, and a staggered entrance. Tilt 3D + cursor glow + banner
 * parallax come from useProfileCardFX (all off under reduced motion).
 *
 * Purely presentational: the caller owns all state (edit-state colors, local
 * object URLs for freshly picked files, etc.) and passes it in. The popout
 * layers its interactive extras through `nameSuffix` (staff/Netrex badges),
 * `onAvatarClick` and the `footer` slot (member since, mutuals, actions).
 */

export interface ProfileIdentityCardProps {
  displayName: string;
  username: string;
  avatarSrc?: string | null;
  bannerSrc?: string | null;
  /** Avatar fallback family (mint/sky/…) while no picture is set. */
  avatarColor?: string | null;
  /** Banner/accent fallback hex while no picture is set. */
  accentColor?: string | null;
  userId?: string | null;
  status?: 'online' | 'idle' | 'dnd' | 'offline' | null;
  customStatus?: string | null;
  bio?: string | null;
  /** Badges rendered inline after the display name (StaffBadge, NetrexChip…). */
  nameSuffix?: React.ReactNode;
  /** Personal profile tint (hex) — drives the shared gradient consumers. */
  profileAccent?: string | null;
  /** Makes the avatar clickable (the popout escalates to the full profile). */
  onAvatarClick?: (e: React.MouseEvent) => void;
  /** Content rendered below the bio, after a divider (member since, actions…). */
  footer?: React.ReactNode;
  className?: string;
}

const STATUS_RING: Record<string, string> = {
  online: 'rgb(var(--status-online) / 0.7)',
  idle: 'rgb(var(--status-idle) / 0.7)',
  dnd: 'rgb(var(--status-dnd) / 0.7)',
  offline: 'rgb(var(--status-offline) / 0.5)',
};

export function ProfileIdentityCard({
  displayName,
  username,
  avatarSrc,
  bannerSrc,
  avatarColor,
  accentColor,
  userId,
  status,
  customStatus,
  bio,
  nameSuffix,
  profileAccent,
  onAvatarClick,
  footer,
  className = '',
}: ProfileIdentityCardProps) {
  const { t } = useLanguage();
  const fx = useProfileCardFX();

  // Banner fallback mirrors the real profile: accent gradient, else the
  // deterministic avatar gradient (alpha baked in).
  const bannerFallback = accentColor
    ? mutedGradient(accentColor, adjustColor(accentColor, -40))
    : (() => {
        const g = getAvatarGradient(userId ?? undefined, displayName, avatarColor);
        return mutedGradient(g.from, g.to);
      })();

  const hasBio = !!(bio && bio.trim());

  // Shared tint util — compact intensity (same consumers as the big modal,
  // one CSS implementation, never duplicated per surface).
  const tint = profileTint(profileAccent, 'compact');

  return (
    <div
      ref={fx.ref}
      onMouseMove={fx.onMouseMove}
      onMouseLeave={fx.onMouseLeave}
      data-profile-identity-card
      className={`profile-fx fx-animatable profile-stagger ${tint.className} relative rounded-[14px] overflow-hidden select-none glass-modal ${className}`}
      style={tint.style}
    >
      {/* Cursor glow layer */}
      <span className="profile-fx-glow" aria-hidden />

      {/* Banner — parallax layer + gradient overlay melting into the card */}
      <div data-stagger="1" className="h-[92px] relative overflow-hidden flex-shrink-0">
        <div
          className="profile-fx-banner"
          style={
            bannerSrc
              ? { backgroundImage: `url(${bannerSrc})` }
              : { background: bannerFallback }
          }
        />
        <div className="profile-fx-banner-overlay" aria-hidden />
      </div>

      {/* Body */}
      <div className="px-4 pb-4 relative">
        <div data-stagger="2" className="relative">
          {/* The ONLY presence indicator is the standardized dot rendered by
              <Avatar> — no decorative halo on top of it. */}
          <div className="inline-block align-top">
            <Avatar
              src={avatarSrc ?? undefined}
              name={displayName}
              size={80}
              status={status}
              userId={userId ?? undefined}
              onClick={onAvatarClick}
              ring={{ width: 3, color: 'rgba(20,20,26,0.85)' }}
              className={`block ${onAvatarClick ? 'cursor-pointer' : ''}`}
            />
          </div>

          {/* Name & info — VERTEX composition: big name + handle chip */}
          <div className="mt-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[17px] font-semibold leading-tight tracking-[-0.01em] text-txt-primary">
                {displayName}
              </span>
              {nameSuffix}
            </div>
            <span
              className="mt-1 inline-flex items-center h-[20px] px-2 rounded-md border border-white/[0.08] bg-white/[0.04] font-mono text-[11.5px] tracking-[0.01em] text-txt-secondary"
            >
              @{username}
            </span>
            <CustomStatusBubble status={customStatus} />
          </div>
        </div>

        {/* Bio — same markdown subset the real profile renders */}
        {hasBio && (
          <div data-stagger="3">
            <div className="border-t border-white/[0.06] my-3" />
            <div>
              <span className="text-[10.5px] uppercase tracking-[0.14em] font-semibold text-txt-tertiary">
                {t('about_me')}
              </span>
              <div className="text-[13px] text-txt-secondary mt-1 whitespace-pre-wrap break-words leading-relaxed [&_strong]:font-semibold [&_strong]:text-txt-primary [&_em]:italic [&_a]:text-accent-primary [&_a]:underline">
                <ReactMarkdown
                  allowedElements={['p', 'strong', 'em', 'a', 'br']}
                  unwrapDisallowed
                  components={{
                    a: ({ href, children }) => (
                      <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
                    ),
                  }}
                >
                  {bio}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        )}

        {/* Caller extras (member since, mutuals, actions…) */}
        {footer && (
          <div data-stagger="4">
            <div className="border-t border-white/[0.06] my-3" />
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

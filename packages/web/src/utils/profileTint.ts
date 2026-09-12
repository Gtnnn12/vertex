import type React from 'react';

/**
 * Single source of truth for the personal profile tint across ALL profile
 * surfaces (big modal, compact popout, mobile). Returns the inline CSS var
 * plus the intensity class; the actual gradient consumers live ONCE in
 * globals.css (.profile-tint-compact / .profile-tint-full). Never duplicate
 * tint CSS per surface — add intensity variants there instead.
 *
 * No accent → 'transparent', so color-mix() consumers resolve to fully
 * transparent and the neutral glass look survives untouched.
 */
export type ProfileTintIntensity = 'compact' | 'full';

export function profileTint(
  accent: string | null | undefined,
  intensity: ProfileTintIntensity = 'compact',
): { style: React.CSSProperties; className: string } {
  return {
    style: { '--profile-accent': accent || 'transparent' } as React.CSSProperties,
    className: intensity === 'full' ? 'profile-tint-full' : 'profile-tint-compact',
  };
}

import type { ActivitySpotify, MusicWidgetStyle } from '@backspace/shared';
import { MUSIC_WIDGET_STYLES, MUSIC_WIDGET_FREE_STYLES } from '@backspace/shared';

/**
 * Data-driven registry of music-widget (Spotify card) visual styles.
 *
 * Every style is a VARIANT of the same card — header, texts, times, states and
 * data are shared (see SpotifyVinyl). Only the disc visual changes, rendered by
 * MusicDisc. The SERVER validates the Netrex entitlement when the style is
 * saved; the client uses this registry only for UI (labels, previews, locks).
 */

export type MusicStyleId = MusicWidgetStyle;

export interface MusicStyleEntry {
  id: MusicStyleId;
  /** i18n key of the display name. */
  nameKey: string;
  /** i18n key of the one-line description. */
  descKey: string;
  /** True when the style needs the Netrex entitlement. */
  requiresNetrex: boolean;
  /** True for styles whose extra FX layer is Netrex-only (arcade). */
  premiumFx: boolean;
  /** Short accent colour used by hub badges/previews. */
  accent: string;
}

const STYLE_LIST: Omit<MusicStyleEntry, 'requiresNetrex'>[] = [
  { id: 'vinyl', nameKey: 'music_style_vinyl_name', descKey: 'music_style_vinyl_desc', premiumFx: false, accent: '#1db954' },
  { id: 'cassette', nameKey: 'music_style_cassette_name', descKey: 'music_style_cassette_desc', premiumFx: true, accent: '#f472b6' },
  { id: 'holographic-cd', nameKey: 'music_style_holo_name', descKey: 'music_style_holo_desc', premiumFx: true, accent: '#a78bfa' },
  { id: 'crystal-orbit', nameKey: 'music_style_crystal_name', descKey: 'music_style_crystal_desc', premiumFx: true, accent: '#7dd3fc' },
  { id: 'spectrum', nameKey: 'music_style_spectrum_name', descKey: 'music_style_spectrum_desc', premiumFx: true, accent: '#fbbf24' },
  { id: 'boombox', nameKey: 'music_style_boombox_name', descKey: 'music_style_boombox_desc', premiumFx: true, accent: '#34d399' },
  { id: 'glass-prism', nameKey: 'music_style_prism_name', descKey: 'music_style_prism_desc', premiumFx: true, accent: '#93c5fd' },
  { id: 'arcade', nameKey: 'music_style_arcade_name', descKey: 'music_style_arcade_desc', premiumFx: true, accent: '#fb7185' },
];

export const MUSIC_STYLES: MusicStyleEntry[] = STYLE_LIST.map((s) => ({
  ...s,
  requiresNetrex: !MUSIC_WIDGET_FREE_STYLES.includes(s.id),
}));

const STYLE_MAP = new Map<MusicStyleId, MusicStyleEntry>(MUSIC_STYLES.map((s) => [s.id, s]));

export function isMusicStyleId(value: unknown): value is MusicStyleId {
  return typeof value === 'string' && MUSIC_WIDGET_STYLES.includes(value as MusicWidgetStyle);
}

export function getMusicStyle(id: MusicStyleId): MusicStyleEntry {
  return STYLE_MAP.get(id) ?? STYLE_MAP.get('vinyl')!;
}

/**
 * Effective style for a user. Enforces the client-side entitlement gate: a
 * premium style without the entitlement falls back to vinyl (the server also
 * enforces this on save — this is the runtime safety net).
 */
export function resolveMusicStyle(saved: MusicStyleId | undefined, isNetrex: boolean): MusicStyleId {
  if (!saved) return 'vinyl';
  const style = STYLE_MAP.get(saved);
  if (!style) return 'vinyl';
  if (style.requiresNetrex && !isNetrex) return 'vinyl';
  return style.id;
}

/** Demo track rendered inside the hub editor — never shown on real profiles. */
export const MUSIC_STYLE_DEMO_TRACK: ActivitySpotify = {
  song: 'Neon Skyline',
  artist: 'The Midnight Drive',
  albumName: 'Chrome Hearts',
  // Data-URI gradient cover: deterministic, zero network, safe for tests.
  albumCover:
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">' +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#f472b6"/><stop offset="0.5" stop-color="#a78bfa"/><stop offset="1" stop-color="#7dd3fc"/>' +
        '</linearGradient></defs>' +
        '<rect width="200" height="200" fill="url(#g)"/>' +
        '<circle cx="150" cy="52" r="26" fill="rgba(255,255,255,0.85)"/>' +
      '</svg>',
    ),
  progressMs: 62_000,
  durationMs: 214_000,
  isPlaying: true,
  fetchedAt: Date.now(),
};

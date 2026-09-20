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
  // ── FREE ──
  { id: 'vinyl', nameKey: 'music_style_vinyl_name', descKey: 'music_style_vinyl_desc', premiumFx: false, accent: '#1db954' },
  { id: 'aurora', nameKey: 'music_style_aurora_name', descKey: 'music_style_aurora_desc', premiumFx: false, accent: '#7fe8c4' },
  { id: 'pixel-paradise', nameKey: 'music_style_pixel_name', descKey: 'music_style_pixel_desc', premiumFx: false, accent: '#ffd166' },
  // ── NETREX ──
  { id: 'kawaii-dream', nameKey: 'music_style_kawaii_name', descKey: 'music_style_kawaii_desc', premiumFx: true, accent: '#f9a8d4' },
  { id: 'neon-city', nameKey: 'music_style_neon_name', descKey: 'music_style_neon_desc', premiumFx: true, accent: '#22d3ee' },
  { id: 'holo-room', nameKey: 'music_style_holoroom_name', descKey: 'music_style_holoroom_desc', premiumFx: true, accent: '#60a5fa' },
  { id: 'nihon', nameKey: 'music_style_nihon_name', descKey: 'music_style_nihon_desc', premiumFx: true, accent: '#f43f5e' },
  { id: 'sweetie', nameKey: 'music_style_sweetie_name', descKey: 'music_style_sweetie_desc', premiumFx: true, accent: '#fda4af' },
  { id: 'ink-panic', nameKey: 'music_style_ink_name', descKey: 'music_style_ink_desc', premiumFx: true, accent: '#ef4444' },
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

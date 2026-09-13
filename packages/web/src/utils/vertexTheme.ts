/**
 * Accent layer — the single personalization surface of VERTEX.
 *
 * The base identity is monochrome (black / white / greys). Each preset below
 * overrides only the accent channels via `data-accent` on <html>; the CSS
 * blocks live in globals.css. Keep every preset limited to accent values so
 * the color always reads as a layer on top of the neutral base — the same
 * shape future theming (surfaces, per-area accents, full themes) can grow
 * into without reworking the token pipeline.
 */

export type AccentChannels = readonly [number, number, number];

/** Theme preference. `system` follows the OS while `data-theme` holds the resolved value. */
export type ThemeId = 'dark' | 'light' | 'system';

/** Effect preference — drives the CSS effect cabinet in globals.css. */
export type EffectId = 'minimal' | 'ambient' | 'glass' | 'glow';

/** Single persisted preference bag (localStorage key: `vertex.preferences`). */
export interface VertexPreferences {
  accent: string;
  theme: ThemeId;
  effects: EffectId;
}

export interface ThemePreset {
  id: ThemeId;
  name: string;
  tagline: string;
}

export interface EffectPreset {
  id: EffectId;
  name: string;
  tagline: string;
  /** Short description shown in the VERTEX section (English fallback). */
  description: string;
  /** i18n key for the localized description; falls back to `description`. */
  descKey: `vertex_eff_desc_${EffectId}`;
}

export const THEMES: readonly ThemePreset[] = [
  { id: 'dark', name: 'Dark', tagline: 'Default' },
  { id: 'light', name: 'Light', tagline: 'Airy' },
];

export const EFFECTS: readonly EffectPreset[] = [
  {
    id: 'minimal',
    name: 'Minimal',
    tagline: 'Flat',
    description: 'Near-opaque surfaces, zero blur, no glow. The quietest look.',
    descKey: 'vertex_eff_desc_minimal',
  },
  {
    id: 'ambient',
    name: 'Ambient',
    tagline: 'Soft',
    description: 'Gentle transparency with a light blur and a soft accent aura.',
    descKey: 'vertex_eff_desc_ambient',
  },
  {
    id: 'glass',
    name: 'Glass',
    tagline: 'Frosted',
    description: 'Full frosted-glass depth — the signature Aether Drift look.',
    descKey: 'vertex_eff_desc_glass',
  },
  {
    id: 'glow',
    name: 'Glow',
    tagline: 'Accent',
    description: 'Adds a subtle accent glow to hovers, focus and highlighted surfaces.',
    descKey: 'vertex_eff_desc_glow',
  },
];

export const PREFERENCES_KEY = 'vertex.preferences';

export const DEFAULT_PREFERENCES: VertexPreferences = {
  accent: 'mono',
  theme: 'dark',
  effects: 'glass',
};

export interface AccentPreset {
  /** Must match the `:root[data-accent="…"]` selector in globals.css. */
  id: string;
  name: string;
  tagline: string;
  primary: AccentChannels;
  hover: AccentChannels;
  active: AccentChannels;
  /** Color used for soft glows / ambient washes (keeps them accent-aware). */
  glow: AccentChannels;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'mono', name: 'Mono', tagline: 'Pure', primary: [130, 130, 140], hover: [148, 148, 158], active: [114, 114, 124], glow: [130, 130, 140] },
  { id: 'indigo', name: 'Indigo', tagline: 'Signal', primary: [99, 102, 241], hover: [88, 90, 232], active: [77, 79, 218], glow: [99, 102, 241] },
  { id: 'blue', name: 'Blue', tagline: 'Deep', primary: [56, 132, 255], hover: [44, 120, 245], active: [34, 108, 235], glow: [56, 132, 255] },
  { id: 'emerald', name: 'Emerald', tagline: 'Calm', primary: [16, 185, 129], hover: [5, 170, 115], active: [4, 148, 102], glow: [16, 185, 129] },
  { id: 'crimson', name: 'Crimson', tagline: 'Ember', primary: [225, 78, 102], hover: [209, 62, 86], active: [192, 48, 72], glow: [225, 78, 102] },
  { id: 'violet', name: 'Violet', tagline: 'Quiet', primary: [139, 92, 246], hover: [122, 75, 230], active: [106, 59, 215], glow: [139, 92, 246] },
];

export const ACCENT_STORAGE_KEY = 'vertex.accent';

let currentPreferences: VertexPreferences = DEFAULT_PREFERENCES;

function isThemeId(value: unknown): value is ThemeId {
  return value === 'dark' || value === 'light' || value === 'system';
}

function isEffectId(value: unknown): value is EffectId {
  return value === 'minimal' || value === 'ambient' || value === 'glass' || value === 'glow';
}

/** Mirrors the OS dark-mode preference. Safe in non-browser environments. */
export function isSystemDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Resolves a theme preference to the actual theme applied on <html>. */
export function resolveTheme(theme: ThemeId): 'dark' | 'light' {
  if (theme === 'system') return isSystemDark() ? 'dark' : 'light';
  return theme;
}

/** Theme currently applied to <html> (system already resolved). */
export function getResolvedTheme(): 'dark' | 'light' {
  return resolveTheme(currentPreferences.theme);
}

export function getCurrentPreferences(): VertexPreferences {
  return { ...currentPreferences };
}

/** Reads + validates the persisted preferences (with legacy `vertex.accent` fallback). */
export function getSavedPreferences(): VertexPreferences {
  let accent = DEFAULT_PREFERENCES.accent;
  let theme: ThemeId = DEFAULT_PREFERENCES.theme;
  let effects: EffectId = DEFAULT_PREFERENCES.effects;

  try {
    const raw = window.localStorage.getItem(PREFERENCES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<VertexPreferences>;
      if (typeof parsed.accent === 'string' && ACCENT_PRESETS.some((p) => p.id === parsed.accent)) {
        accent = parsed.accent;
      }
      if (isThemeId(parsed.theme)) theme = parsed.theme;
      if (isEffectId(parsed.effects)) effects = parsed.effects;
    } else {
      // Legacy: only the accent was persisted under its own key.
      const legacy = window.localStorage.getItem(ACCENT_STORAGE_KEY);
      if (legacy && ACCENT_PRESETS.some((p) => p.id === legacy)) accent = legacy;
    }
  } catch {
    /* storage unavailable or corrupt — fall back to defaults */
  }

  return { accent, theme, effects };
}

function persistPreferences(prefs: VertexPreferences): void {
  try {
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
  } catch {
    /* quota / privacy-mode failures are non-fatal; attributes still apply */
  }
}

function applyResolved(prefs: VertexPreferences): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', resolveTheme(prefs.theme));
  root.setAttribute('data-effects', prefs.effects);
  applyAccent(prefs.accent);

  const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (meta) meta.setAttribute('content', resolveTheme(prefs.theme));

  // Notify optional layers (e.g. the Netrex custom theme) so they can
  // re-derive after a base-theme switch. Decoupled via DOM event: no import
  // cycle, and listeners are free to ignore it.
  window.dispatchEvent(new CustomEvent('vertex:themechange', {
    detail: { theme: resolveTheme(prefs.theme) },
  }));
}

/**
 * Applies a (possibly partial) preference update to <html>, returns the full
 * merged preferences, and persists them under a single `vertex.preferences` key.
 */
export function applyPreferences(
  next: Partial<VertexPreferences>,
  options?: { persist?: boolean }
): VertexPreferences {
  const merged: VertexPreferences = {
    accent: next.accent ?? currentPreferences.accent,
    theme: next.theme ?? currentPreferences.theme,
    effects: next.effects ?? currentPreferences.effects,
  };
  currentPreferences = merged;
  applyResolved(merged);
  if (options?.persist !== false) persistPreferences(merged);
  return { ...merged };
}

/** Applies the persisted preferences before first paint and keeps `system` live. */
export function initVertexAppearance(): void {
  currentPreferences = getSavedPreferences();
  applyResolved(currentPreferences);

  if (typeof window === 'undefined' || !window.matchMedia) return;

  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onSystemChange = () => {
    if (currentPreferences.theme !== 'system') return;
    document.documentElement.setAttribute('data-theme', resolveTheme('system'));
    const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
    if (meta) meta.setAttribute('content', resolveTheme('system'));
  };
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', onSystemChange);
  } else if (typeof media.addListener === 'function') {
    media.addListener(onSystemChange);
  }
}

export function applyAccent(id: string): boolean {
  const preset = ACCENT_PRESETS.find((p) => p.id === id);
  if (!preset) return false;
  document.documentElement.setAttribute('data-accent', preset.id);
  try {
    window.localStorage.setItem(ACCENT_STORAGE_KEY, preset.id);
  } catch {
    /* quota / privacy-mode failures are non-fatal; the attribute still applies */
  }
  return true;
}
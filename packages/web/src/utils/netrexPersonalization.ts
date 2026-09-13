/**
 * Netrex personalization bridge — maps the Netrex PersonalizationEditor's
 * PreviewState onto the REAL VERTEX appearance.
 *
 * Two layers are applied on <html>:
 *
 * 1. `data-custom-theme` attribute + inline CSS custom properties (accent,
 *    surfaces, borders, text) — these sit on `:root[data-custom-theme]` and
 *    win over the base `:root { … }` token set, so EVERY component that reads
 *    Tailwind's `bg-surface-*` / `text-txt-*` / `border-*` utilities re-skins
 *    immediately: sidebar, chat, members, home, servers, DMs, modals, etc.
 *
 * 2. The canonical `vertexTheme` pipeline (`data-accent` / `data-effects` +
 *    `vertex.preferences`) stays in sync so the VERTEX section and effects
 *    cabinet keep working normally.
 *
 * Persisted under `vertex.customTheme` and re-applied on every boot by
 * `initVertexAppearance` (called from main.tsx before first paint).
 */
import {
  ACCENT_PRESETS,
  applyPreferences,
  getResolvedTheme,
  type AccentPreset,
} from './vertexTheme';
import type { EffectId } from './vertexTheme';
import type { PreviewState } from '../components/netrex/VERTEXAppPreview';
import { buildPreviewState } from '../components/netrex/VERTEXAppPreview';

const CUSTOM_THEME_KEY = 'vertex.customTheme';

const ROOT = typeof document !== 'undefined' ? document.documentElement : null;

// ─── Color helpers ──────────────────────────────────────────────────────────

function hexToRgbChannels(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Relative-luminance aware mix between two hex colors. */
function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgbChannels(a);
  const cb = hexToRgbChannels(b);
  if (!ca || !cb) return a;
  const ch = (i: number) => Math.round(ca[i] + (cb[i] - ca[i]) * t);
  const to = (n: number) => n.toString(16).padStart(2, '0');
  return `#${to(ch(0))}${to(ch(1))}${to(ch(2))}`;
}

/** Perceived brightness 0–1, used to keep text readable on custom surfaces. */
function luminance(hex: string): number {
  const c = hexToRgbChannels(hex);
  if (!c) return 0;
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Nearest built-in accent preset by hue distance (fallback: mono). */
export function nearestAccentPreset(hex: string): AccentPreset {
  const rgb = hexToRgbChannels(hex);
  if (!rgb) return ACCENT_PRESETS[0];
  let best = ACCENT_PRESETS[0];
  let bestDist = Infinity;
  for (const preset of ACCENT_PRESETS) {
    const d =
      (preset.primary[0] - rgb[0]) ** 2 +
      (preset.primary[1] - rgb[1]) ** 2 +
      (preset.primary[2] - rgb[2]) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = preset;
    }
  }
  return best;
}

/** Map the editor's glow slider (0–10) onto the nearest real effect preset. */
export function effectFromGlow(glowIntensity: number, effectsEnabled: boolean): EffectId {
  if (!effectsEnabled) return 'minimal';
  if (glowIntensity >= 7) return 'glow';
  if (glowIntensity <= 2) return 'minimal';
  return 'glass';
}

// ─── Core: build + inject the custom theme layer ────────────────────────────

interface CustomThemeVars {
  [k: string]: string;
}

/** Every CSS custom property this module may inject on :root (for clean removal). */
const MANAGED_VARS = [
  '--accent-primary',
  '--accent-primary-hover',
  '--accent-primary-active',
  '--accent-primary-glow',
  '--accent-primary-comma',
  '--bg-base',
  '--bg-chat',
  '--bg-channel',
  '--bg-members',
  '--bg-elevated',
  '--bg-input',
  '--border-hard',
  '--border-soft',
  '--text-primary',
  '--text-message',
  '--text-secondary',
  '--text-tertiary',
  '--text-category',
  '--custom-bg',
] as const;

/**
 * Derive the :root variable set from the editor state.
 *
 * THEME-AWARE: the base theme (dark/light) owns surfaces, borders and text —
 * the custom theme only overrides the ACCENT plus, in DARK mode, the surfaces
 * the user explicitly customized. Injecting hardcoded dark surfaces in light
 * mode is what broke Light; now light always keeps its base palette and just
 * takes the user's accent.
 */
export function buildCustomThemeVars(state: PreviewState): CustomThemeVars {
  const vars: CustomThemeVars = {};
  const ch = (hex: string) => hexToRgbChannels(hex)?.join(' ') ?? null;

  const accent = state.accentColor?.hex ?? '';

  // Accent (drives --accent-primary and all Tailwind accent-* utilities) —
  // applied in BOTH themes: it is the one thing the user is personalizing.
  const accentCh = ch(accent);
  if (accentCh) {
    vars['--accent-primary'] = accentCh;
    vars['--accent-primary-hover'] = ch(mixHex(accent, '#ffffff', 0.12)) ?? accentCh;
    vars['--accent-primary-active'] = ch(mixHex(accent, '#000000', 0.12)) ?? accentCh;
    vars['--accent-primary-glow'] = accentCh;
    vars['--accent-primary-comma'] = hexToRgbChannels(accent)!.join(', ');
  }

  // Surfaces / borders / text: DARK-only overrides. In light mode the base
  // palette wins so the whole app stays airy and readable.
  if (getResolvedTheme() === 'dark') {
    const primary = state.primaryColor?.hex ?? '';
    const secondary = state.secondaryColor?.hex ?? '';
    const bg = state.backgroundSolid || state.bgColor?.hex || '';
    const text = state.textColor?.hex ?? '';
    const muted = state.mutedColor?.hex ?? '';

    const bgCh = ch(bg);
    if (bgCh) {
      vars['--bg-base'] = bgCh;
      vars['--bg-chat'] = bgCh;
      vars['--bg-channel'] = ch(mixHex(bg, secondary, 0.75)) ?? bgCh;
      vars['--bg-members'] = vars['--bg-channel'];
      vars['--bg-elevated'] = ch(mixHex(bg, secondary, 0.45)) ?? bgCh;
      vars['--bg-input'] = ch(mixHex(bg, '#000000', 0.18)) ?? bgCh;
    }

    vars['--border-hard'] = ch(mixHex(bg, '#ffffff', 0.09)) ?? vars['--bg-base'] ?? '';
    vars['--border-soft'] = ch(mixHex(bg, '#ffffff', 0.13)) ?? vars['--bg-base'] ?? '';

    const textCh = ch(text);
    if (textCh) {
      vars['--text-primary'] = textCh;
      vars['--text-message'] = textCh;
      vars['--text-secondary'] = ch(mixHex(text, muted, 0.45)) ?? textCh;
      vars['--text-tertiary'] = ch(mixHex(text, muted, 0.72)) ?? textCh;
      vars['--text-category'] = ch(mixHex(text, muted, 0.85)) ?? textCh;
    }
  }

  return vars;
}

function applyCustomThemeDom(state: PreviewState): void {
  if (!ROOT) return;

  // Clear previously injected vars first, then inject the fresh set — this
  // makes theme switches (dark↔light) re-derive the layer from scratch
  // instead of stacking stale dark surfaces on top of light.
  clearCustomThemeDom();

  const vars = buildCustomThemeVars(state);

  // Inline style wins over both :root and :root[data-theme] declarations
  // (element style > selector specificity), while data-custom-theme marks the
  // state for CSS that needs to know (e.g. gradient background layer).
  for (const [k, v] of Object.entries(vars)) {
    ROOT.style.setProperty(k, v);
  }
  if (Object.keys(vars).length > 0) ROOT.setAttribute('data-custom-theme', '1');

  // App-wide background: solid or gradient behind everything — dark mode
  // only. Light mode keeps the base body background.
  if (getResolvedTheme() === 'dark') {
    ROOT.style.setProperty(
      '--custom-bg',
      state.backgroundType === 'gradient' ? state.backgroundGradient : state.backgroundSolid
    );
  }
}

function clearCustomThemeDom(): void {
  if (!ROOT) return;
  // Remove every variable this module manages — no state reconstruction needed,
  // so this can never throw on a partial/corrupted saved state.
  for (const k of MANAGED_VARS) ROOT.style.removeProperty(k);
  ROOT.style.removeProperty('--custom-bg');
  ROOT.removeAttribute('data-custom-theme');
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Apply the editor's saved state to the live app appearance AND persist it.
 * Returns the applied { accentId, effect } for feedback/UI sync.
 */
export function applyNetrexPersonalization(state: PreviewState): {
  accentId: string;
  effect: EffectId;
} {
  const accent = nearestAccentPreset(state.accentColor.hex);
  const effect = effectFromGlow(state.glowIntensity, state.effectsEnabled);

  // Layer 1: exact custom theme (accent always; surfaces/text in dark only).
  applyCustomThemeDom(state);
  document.body.style.background = getResolvedTheme() === 'dark'
    ? 'var(--custom-bg, var(--bg-base))'
    : '';

  // Layer 2: keep the canonical accent/effects pipeline in sync.
  applyPreferences({ accent: accent.id, effects: effect });

  // Persist both layers for boot re-application.
  try {
    localStorage.setItem(
      CUSTOM_THEME_KEY,
      JSON.stringify({
        accentId: accent.id,
        effect,
        state: {
          accentColor: state.accentColor,
          primaryColor: state.primaryColor,
          secondaryColor: state.secondaryColor,
          bgColor: state.bgColor,
          surfaceColor: state.surfaceColor,
          textColor: state.textColor,
          mutedColor: state.mutedColor,
          backgroundType: state.backgroundType,
          backgroundGradient: state.backgroundGradient,
          backgroundSolid: state.backgroundSolid,
          effectsEnabled: state.effectsEnabled,
          glowIntensity: state.glowIntensity,
        },
      })
    );
  } catch {
    /* storage unavailable — live theme still applies for this session */
  }

  return { accentId: accent.id, effect };
}

/**
 * Re-apply the persisted custom theme (called from initVertexAppearance on
 * every boot, before first paint). Safe to call when nothing was saved.
 */
export function initNetrexCustomTheme(): void {
  try {
    const raw = localStorage.getItem(CUSTOM_THEME_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as {
      accentId: string;
      effect: EffectId;
      state: Partial<PreviewState>;
    };
    const state = {
      accentColor: saved.state.accentColor ?? { hex: '#82efac', rgb: '134, 239, 172' },
      primaryColor: saved.state.primaryColor ?? { hex: '#13131a', rgb: '19, 19, 26' },
      secondaryColor: saved.state.secondaryColor ?? { hex: '#1a1a23', rgb: '26, 26, 35' },
      bgColor: saved.state.bgColor ?? saved.state.primaryColor ?? { hex: '#13131a', rgb: '19, 19, 26' },
      surfaceColor: saved.state.surfaceColor ?? { hex: '#1a1a23', rgb: '26, 26, 35' },
      textColor: saved.state.textColor ?? { hex: '#f4f4f5', rgb: '244, 244, 245' },
      mutedColor: saved.state.mutedColor ?? { hex: '#71717a', rgb: '113, 113, 122' },
      backgroundType: saved.state.backgroundType ?? 'solid',
      backgroundGradient: saved.state.backgroundGradient ?? '',
      backgroundSolid: saved.state.backgroundSolid ?? '#13131a',
      effectsEnabled: saved.state.effectsEnabled ?? true,
      glowIntensity: saved.state.glowIntensity ?? 5,
    } as PreviewState;

    applyCustomThemeDom(state);
    document.body.style.background = getResolvedTheme() === 'dark'
      ? 'var(--custom-bg, var(--bg-base))'
      : '';
  } catch {
    /* corrupt payload — ignore, base theme applies */
  }
}

/**
 * Re-sync the custom theme layer after a base-theme switch (dark↔light).
 * Dark re-injects surfaces + custom bg; light drops to accent-only.
 */
export function resyncNetrexCustomTheme(): void {
  try {
    const raw = localStorage.getItem(CUSTOM_THEME_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as { state?: Partial<PreviewState> };
    if (!saved.state) return;
    applyCustomThemeDom(buildPreviewState(saved.state));
    document.body.style.background = getResolvedTheme() === 'dark'
      ? 'var(--custom-bg, var(--bg-base))'
      : '';
  } catch {
    /* ignore */
  }
}

// Live re-sync on every base-theme switch (dark↔light, incl. system flips).
if (typeof window !== 'undefined') {
  window.addEventListener('vertex:themechange', () => resyncNetrexCustomTheme());
}

export { clearCustomThemeDom, CUSTOM_THEME_KEY };

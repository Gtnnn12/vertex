import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  VERTEXAppPreview,
  buildPreviewState,
  hexToRgb,
  type PreviewState,
} from './VERTEXAppPreview';

export type { PreviewState } from './VERTEXAppPreview';

const FONT_FAMILIES = [
  { id: 'dm-sans', name: 'DM Sans', value: "'DM Sans', sans-serif" },
  { id: 'inter', name: 'Inter', value: "'Inter', sans-serif" },
  { id: 'poppins', name: 'Poppins', value: "'Poppins', sans-serif" },
  { id: 'jetbrains', name: 'JetBrains Mono', value: "'JetBrains Mono', monospace" },
  { id: 'playfair', name: 'Playfair Display', value: "'Playfair Display', serif" },
  { id: 'space-grotesk', name: 'Space Grotesk', value: "'Space Grotesk', sans-serif" },
];

const FONT_WEIGHTS = ['300', '400', '500', '600', '700'];

const COLOR_PRESETS = [
  { name: 'Vertex', accent: '#82efac', primary: '#13131a', secondary: '#1a1a23' },
  { name: 'Peach', accent: '#fca5a5', primary: '#1a1412', secondary: '#231a16' },
  { name: 'Aurora', accent: '#86efac', primary: '#0f1a16', secondary: '#142320' },
  { name: 'Crimson', accent: '#fda4af', primary: '#1a0a0a', secondary: '#231414' },
  { name: 'Cyber', accent: '#00ffd5', primary: '#0a0a14', secondary: '#0f1420' },
  { name: 'Ocean', accent: '#7dd3fc', primary: '#0a1014', secondary: '#101820' },
  { name: 'Emerald', accent: '#6ee7b7', primary: '#0a1410', secondary: '#101c14' },
  { name: 'Purple', accent: '#c4b5fd', primary: '#12101a', secondary: '#1a1423' },
  { name: 'Monochrome', accent: '#a8a8b8', primary: '#0a0a0a', secondary: '#141414' },
];

// ─── HSV helpers (for the premium color picker) ─────────────────────────────

interface Hsv {
  h: number; // 0-360
  s: number; // 0-1
  v: number; // 0-1
}

function hexToHsv(hex: string): Hsv {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const to = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

// ─── PremiumColorField — visual picker (SV square + hue slider + hex) ───────

function PremiumColorField({
  label,
  value,
  alignRight = false,
  onChange,
}: {
  label: string;
  value: PreviewState['accentColor'];
  /** Open the popover aligned to the right edge (for fields in the right grid column). */
  alignRight?: boolean;
  onChange: (v: PreviewState['accentColor']) => void;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svRef = useRef<HTMLDivElement>(null);
  const [hexDraft, setHexDraft] = useState<string | null>(null);

  const hsv = useMemo(() => hexToHsv(value.hex), [value.hex]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const commitHex = (hex: string) => {
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) onChange(hexToRgb(hex));
  };

  const handleSvPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = svRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const s = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const v = Math.min(1, Math.max(0, 1 - (e.clientY - rect.top) / rect.height));
    onChange(hexToRgb(hsvToHex(hsv.h, s, v)));
  };

  const handleSvKey = (e: React.KeyboardEvent) => {
    const step = 0.04;
    if (e.key === 'ArrowLeft') onChange(hexToRgb(hsvToHex(hsv.h, Math.max(0, hsv.s - step), hsv.v)));
    else if (e.key === 'ArrowRight') onChange(hexToRgb(hsvToHex(hsv.h, Math.min(1, hsv.s + step), hsv.v)));
    else if (e.key === 'ArrowUp') onChange(hexToRgb(hsvToHex(hsv.h, hsv.s, Math.min(1, hsv.v + step))));
    else if (e.key === 'ArrowDown') onChange(hexToRgb(hsvToHex(hsv.h, hsv.s, Math.max(0, hsv.v - step))));
    else return;
    e.preventDefault();
  };

  return (
    <div className="relative flex flex-col gap-1.5" ref={wrapRef}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-txt-secondary">{label}</span>
        <span className="text-[10px] font-mono text-txt-tertiary">{value.hex.toUpperCase()}</span>
      </div>

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        className={`flex items-center gap-2.5 w-full rounded-xl border px-2.5 py-2 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ${
          open
            ? 'border-white/[0.14] bg-white/[0.05]'
            : 'border-white/[0.07] bg-white/[0.03] hover:border-white/[0.12] hover:bg-white/[0.05]'
        }`}
      >
        <span
          className="h-6 w-6 flex-shrink-0 rounded-lg border border-white/10 transition-transform duration-200 group-hover:scale-105"
          style={{ background: value.hex, boxShadow: `0 2px 8px -2px ${value.hex}66, inset 0 1px 0 rgba(255,255,255,0.15)` }}
        />
        <span className="flex-1 text-left font-mono text-[11px] text-txt-secondary">
          {value.hex.toUpperCase()}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-txt-tertiary transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Popover picker */}
      {open && (
        <div
          role="dialog"
          aria-label={label}
          className={`prem-popover absolute top-full z-40 mt-2 w-[248px] rounded-2xl border border-white/[0.09] bg-[#15151c]/97 p-3 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur-xl ${
            alignRight ? 'right-0' : 'left-0'
          }`}
        >
          {/* Saturation / value square */}
          <div
            ref={svRef}
            role="slider"
            tabIndex={0}
            aria-label={`${label} — ${t('prem_color_sv_area')}`}
            aria-valuetext={value.hex.toUpperCase()}
            onKeyDown={handleSvKey}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              handleSvPointer(e);
            }}
            onPointerMove={(e) => {
              if (e.buttons & 1) handleSvPointer(e);
            }}
            className="relative h-36 w-full cursor-crosshair touch-none rounded-xl border border-white/[0.08] transition-shadow duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
            style={{
              background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0)), hsl(${hsv.h} 100% 50%)`,
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_1px_4px_rgba(0,0,0,0.5)]"
              style={{
                left: `${hsv.s * 100}%`,
                top: `${(1 - hsv.v) * 100}%`,
                background: value.hex,
              }}
            />
          </div>

          {/* Hue slider */}
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={Math.round(hsv.h)}
            onChange={(e) => onChange(hexToRgb(hsvToHex(Number(e.target.value), hsv.s, hsv.v)))}
            aria-label={`${label} — hue`}
            className="prem-slider prem-slider--hue mt-3 h-2 w-full cursor-pointer appearance-none rounded-full"
            style={{
              background:
                'linear-gradient(to right, hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), hsl(180 100% 50%), hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%))',
            }}
          />

          {/* Hex input + OS native picker */}
          <div className="mt-3 flex items-center gap-2">
            <div className="flex flex-1 items-center gap-1 rounded-lg border border-white/[0.08] bg-black/25 px-2.5 py-1.5 transition-colors focus-within:border-accent-primary/50">
              <span className="font-mono text-[11px] text-txt-tertiary">#</span>
              <input
                type="text"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                maxLength={6}
                value={hexDraft ?? value.hex.replace('#', '').toUpperCase()}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
                  setHexDraft(v);
                  if (v.length === 6) commitHex(`#${v}`);
                }}
                onBlur={() => setHexDraft(null)}
                aria-label={`${label} — hex`}
                className="w-full bg-transparent font-mono text-[11px] uppercase text-txt-primary focus:outline-none"
              />
            </div>
            <label
              className="relative h-8 w-8 flex-shrink-0 cursor-pointer overflow-hidden rounded-lg border border-white/[0.1] transition-transform hover:scale-105"
              style={{ background: value.hex }}
              title="OS color picker"
            >
              <input
                type="color"
                value={value.hex}
                onChange={(e) => onChange(hexToRgb(e.target.value))}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label={`${label} — ${t('prem_color_native')}`}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Slider — restyled with accent fill + glowing thumb ─────────────────────

function SliderControl({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  accent,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  accent: string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-txt-secondary">{label}</span>
        <span
          className="rounded-md px-1.5 py-0.5 font-mono text-[10px] tabular-nums"
          style={{ background: `${accent}14`, color: accent }}
        >
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="prem-slider h-1.5 w-full cursor-pointer appearance-none rounded-full"
        style={{
          background: `linear-gradient(to right, ${accent} 0%, ${accent} ${pct}%, rgba(255,255,255,0.08) ${pct}%, rgba(255,255,255,0.08) 100%)`,
        }}
        aria-label={label}
      />
    </div>
  );
}

// ─── Segmented control — consistent with the tab bar aesthetic ──────────────

function Segmented<T extends string>({
  options,
  value,
  accent,
  onChange,
  renderLabel,
}: {
  options: readonly T[];
  value: T;
  accent: string;
  onChange: (v: T) => void;
  renderLabel: (v: T) => string;
}) {
  return (
    <div className="flex gap-1 rounded-xl border border-white/[0.06] bg-black/20 p-1">
      {options.map((opt) => {
        const selected = opt === value;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            aria-pressed={selected}
            className={`flex-1 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ${
              selected ? '' : 'text-txt-tertiary hover:bg-white/[0.05] hover:text-txt-secondary'
            }`}
            style={selected ? { background: `${accent}1f`, color: accent } : undefined}
          >
            {renderLabel(opt)}
          </button>
        );
      })}
    </div>
  );
}

// ─── Preset card — mini VERTEX mock (sidebar + chat) ────────────────────────

function PresetCard({
  preset,
  selected,
  onSelect,
}: {
  preset: (typeof COLOR_PRESETS)[0];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`prem-preset-card group relative flex flex-col overflow-hidden rounded-xl border text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ${
        selected
          ? 'border-transparent ring-2'
          : 'border-white/[0.07] hover:-translate-y-0.5 hover:border-white/[0.16] hover:shadow-[0_10px_28px_-10px_rgba(0,0,0,0.55)]'
      }`}
      style={selected ? ({ '--tw-ring-color': preset.accent } as React.CSSProperties) : undefined}
      title={preset.name}
    >
      {/* Mini app mock */}
      <div className="flex h-[64px] w-full">
        {/* Mini server rail + channels */}
        <div
          className="flex w-[30px] flex-shrink-0 flex-col items-center gap-1 py-1.5"
          style={{ background: preset.secondary }}
        >
          <span
            className="h-3.5 w-3.5 rounded-[4px]"
            style={{ background: preset.accent, boxShadow: `0 0 6px ${preset.accent}88` }}
          />
          <span className="h-2 w-2 rounded-[3px] bg-white/15" />
          <span className="h-2 w-2 rounded-[3px] bg-white/10" />
        </div>
        {/* Mini chat */}
        <div
          className="flex flex-1 flex-col justify-end gap-1 p-1.5"
          style={{ background: preset.primary }}
        >
          <span className="h-[5px] w-[72%] rounded-full" style={{ background: 'rgba(255,255,255,0.14)' }} />
          <span className="h-[5px] w-[52%] rounded-full" style={{ background: 'rgba(255,255,255,0.09)' }} />
          <span className="h-[5px] w-[62%] rounded-full" style={{ background: preset.accent, opacity: 0.85 }} />
        </div>
      </div>

      {/* Name row */}
      <div
        className="flex items-center justify-between gap-1 px-2.5 py-2"
        style={{ background: preset.secondary, borderTop: '1px solid rgba(255,255,255,0.05)' }}
      >
        <span className="truncate text-[10px] font-bold text-txt-primary">{preset.name}</span>
        <span
          className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full transition-all duration-200 ${
            selected ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
          }`}
          style={{ background: preset.accent }}
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#0b0b10" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <path d="m4 12.5 5 5L20 6.5" />
          </svg>
        </span>
      </div>
    </button>
  );
}

// ─── Tabs with animated indicator ───────────────────────────────────────────

type TabId = 'color' | 'typography' | 'ui';

function TabBar({
  tabs,
  active,
  accent,
  onChange,
}: {
  tabs: { id: TabId; label: string }[];
  active: TabId;
  accent: string;
  onChange: (id: TabId) => void;
}) {
  const index = tabs.findIndex((tb) => tb.id === active);
  return (
    <div
      role="tablist"
      aria-label="Personalization sections"
      className="relative flex rounded-xl border border-white/[0.06] bg-black/25 p-1"
    >
      {/* Animated sliding indicator */}
      <span
        aria-hidden
        className="prem-tab-indicator pointer-events-none absolute bottom-1 top-1 rounded-lg"
        style={{
          width: `calc((100% - 8px) / ${tabs.length})`,
          left: 4,
          transform: `translateX(${index * 100}%)`,
          background: 'rgba(255,255,255,0.07)',
          boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.07), 0 4px 14px -6px ${accent}55`,
        }}
      />
      {tabs.map((tb) => {
        const selected = tb.id === active;
        return (
          <button
            key={tb.id}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tb.id)}
            className={`relative z-10 flex-1 rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ${
              selected ? 'text-txt-primary' : 'text-txt-tertiary hover:text-txt-secondary'
            }`}
            style={selected ? { color: accent } : undefined}
          >
            {tb.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main editor ────────────────────────────────────────────────────────────

export interface PersonalizationEditorProps {
  isNetrex: boolean;
  /** Initialized-from state (saved prefs) to restore on mount. */
  initialState?: PreviewState;
  /** Called when user clicks Save. Only used in modal mode. */
  onSave?: (state: PreviewState) => void;
  /** Called when user clicks Cancel/Close. Only used in modal mode. */
  onClose?: () => void;
}

export function PersonalizationEditor({ isNetrex, initialState, onSave, onClose }: PersonalizationEditorProps) {
  const { t } = useLanguage();

  const [preview, setPreview] = useState<PreviewState>(() => buildPreviewState(initialState));
  const [activeTab, setActiveTab] = useState<TabId>('color');

  const updatePreview = useCallback((updates: Partial<PreviewState>) => {
    setPreview((prev) => ({ ...prev, ...updates }));
  }, []);

  const applyPreset = useCallback((preset: (typeof COLOR_PRESETS)[0]) => {
    setPreview((prev) => ({
      ...prev,
      accentColor: hexToRgb(preset.accent),
      primaryColor: hexToRgb(preset.primary),
      secondaryColor: hexToRgb(preset.secondary),
    }));
  }, []);

  const resetPreview = useCallback(() => {
    setPreview(buildPreviewState({}));
  }, []);

  const accentCss = preview.accentColor.hex;

  const tabs: { id: TabId; label: string }[] = [
    { id: 'color', label: t('tab_color') },
    { id: 'typography', label: t('tab_typography') },
    { id: 'ui', label: t('tab_ui') },
  ];

  return (
    <div className="flex min-h-full flex-col">
      {/* ── Section header ── */}
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[18px] font-bold tracking-tight text-txt-primary">
            {t('personalize_title')}
          </h2>
          <p className="mt-0.5 text-[12px] text-txt-tertiary">{t('personalize_subtitle')}</p>
        </div>
        <div className="flex items-center gap-1.5 pb-0.5">
          <span className="text-[10px] font-bold text-txt-tertiary">
            {isNetrex ? t('netrex_active') : t('preview_mode')}
          </span>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
              isNetrex
                ? 'border-accent-peach/25 bg-[rgba(252,165,165,0.12)] text-accent-peach'
                : 'border-white/[0.08] bg-white/[0.05] text-txt-tertiary'
            }`}
          >
            ✦ NETREX
          </span>
        </div>
      </div>

      {/* ── Two-column body: controls | sticky live preview ── */}
      <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]">
        {/* Controls column */}
        <div className="order-2 min-w-0 lg:order-1">
          <TabBar tabs={tabs} active={activeTab} accent={accentCss} onChange={setActiveTab} />

          <div key={activeTab} className="prem-stagger space-y-7 pt-6 pb-2">
            {/* ── Color tab ── */}
            {activeTab === 'color' && (
              <>
                <div>
                  <span className="mb-3 block text-[11px] font-semibold uppercase tracking-[0.08em] text-txt-tertiary">
                    {t('color_presets')}
                  </span>
                  <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-3">
                    {COLOR_PRESETS.map((preset) => {
                      const isActive =
                        preset.accent.toLowerCase() === preview.accentColor.hex.toLowerCase();
                      return (
                        <PresetCard
                          key={preset.name}
                          preset={preset}
                          selected={isActive}
                          onSelect={() => applyPreset(preset)}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2">
                  <PremiumColorField
                    label={t('color_accent')}
                    value={preview.accentColor}
                    onChange={(v) => updatePreview({ accentColor: v })}
                  />
                  <PremiumColorField
                    label={t('color_primary')}
                    value={preview.primaryColor}
                    alignRight
                    onChange={(v) => updatePreview({ primaryColor: v })}
                  />
                  <PremiumColorField
                    label={t('color_secondary')}
                    value={preview.secondaryColor}
                    onChange={(v) => updatePreview({ secondaryColor: v })}
                  />
                  <PremiumColorField
                    label={t('color_background')}
                    value={preview.bgColor}
                    alignRight
                    onChange={(v) => updatePreview({ bgColor: v, backgroundSolid: v.hex })}
                  />
                  <PremiumColorField
                    label={t('color_surface')}
                    value={preview.surfaceColor}
                    onChange={(v) => updatePreview({ surfaceColor: v })}
                  />
                  <PremiumColorField
                    label={t('color_text')}
                    value={preview.textColor}
                    alignRight
                    onChange={(v) => updatePreview({ textColor: v })}
                  />
                  <PremiumColorField
                    label={t('color_muted')}
                    value={preview.mutedColor}
                    onChange={(v) => updatePreview({ mutedColor: v })}
                  />
                </div>

                <div>
                  <span className="mb-2.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-txt-tertiary">
                    {t('background_type')}
                  </span>
                  <Segmented
                    options={['solid', 'gradient'] as const}
                    value={preview.backgroundType}
                    accent={accentCss}
                    onChange={(type) => updatePreview({ backgroundType: type })}
                    renderLabel={(type) => (type === 'solid' ? t('bg_solid') : t('bg_gradient'))}
                  />
                </div>
              </>
            )}

            {/* ── Typography tab ── */}
            {activeTab === 'typography' && (
              <>
                <div>
                  <span className="mb-3 block text-[11px] font-semibold uppercase tracking-[0.08em] text-txt-tertiary">
                    {t('font_family')}
                  </span>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {FONT_FAMILIES.map((font) => {
                      const selected = preview.fontFamily === font.value;
                      return (
                        <button
                          key={font.id}
                          type="button"
                          onClick={() => updatePreview({ fontFamily: font.value })}
                          aria-pressed={selected}
                          className={`rounded-xl border px-3 py-3 text-[12px] font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 hover:-translate-y-0.5 ${
                            selected
                              ? 'border-transparent'
                              : 'border-white/[0.07] bg-white/[0.03] text-txt-secondary hover:border-white/[0.14] hover:bg-white/[0.05]'
                          }`}
                          style={
                            selected
                              ? {
                                  background: `${accentCss}14`,
                                  color: accentCss,
                                  fontFamily: font.value,
                                  boxShadow: `inset 0 0 0 1.5px ${accentCss}66, 0 8px 24px -12px ${accentCss}55`,
                                }
                              : { fontFamily: font.value }
                          }
                        >
                          {font.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <SliderControl
                  label={t('font_size')}
                  value={preview.fontSize}
                  min={11}
                  max={18}
                  unit="px"
                  accent={accentCss}
                  onChange={(v) => updatePreview({ fontSize: v })}
                />

                <div>
                  <span className="mb-2.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-txt-tertiary">
                    {t('font_weight')}
                  </span>
                  <Segmented
                    options={FONT_WEIGHTS}
                    value={preview.fontWeight}
                    accent={accentCss}
                    onChange={(w) => updatePreview({ fontWeight: w })}
                    renderLabel={(w) => w}
                  />
                </div>

                <div>
                  <span className="mb-2.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-txt-tertiary">
                    {t('ui_density')}
                  </span>
                  <Segmented
                    options={['compact', 'comfortable', 'spacious'] as const}
                    value={preview.density}
                    accent={accentCss}
                    onChange={(density) => updatePreview({ density })}
                    renderLabel={(d) => t(`density_${d}`)}
                  />
                </div>
              </>
            )}

            {/* ── UI tab ── */}
            {activeTab === 'ui' && (
              <div className="grid grid-cols-1 gap-x-6 gap-y-7 sm:grid-cols-2">
                <SliderControl
                  label={t('corner_radius')}
                  value={preview.cornerRadius}
                  min={0}
                  max={16}
                  unit="px"
                  accent={accentCss}
                  onChange={(v) => updatePreview({ cornerRadius: v })}
                />
                <SliderControl
                  label={t('border_intensity')}
                  value={preview.borderIntensity}
                  min={0}
                  max={10}
                  accent={accentCss}
                  onChange={(v) => updatePreview({ borderIntensity: v })}
                />
                <SliderControl
                  label={t('glow_intensity')}
                  value={preview.glowIntensity}
                  min={0}
                  max={10}
                  accent={accentCss}
                  onChange={(v) => updatePreview({ glowIntensity: v })}
                />

                <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-3">
                  <span className="text-[11px] font-semibold text-txt-secondary">
                    {t('effects_enabled')}
                  </span>
                  <button
                    type="button"
                    onClick={() => updatePreview({ effectsEnabled: !preview.effectsEnabled })}
                    role="switch"
                    aria-checked={preview.effectsEnabled}
                    aria-label={t('effects_enabled')}
                    className="relative h-5 w-9 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                    style={{ background: preview.effectsEnabled ? accentCss : 'rgb(var(--interactive-muted) / 0.6)' }}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                        preview.effectsEnabled ? 'translate-x-4.5' : 'translate-x-0.5'
                      }`}
                      style={{ transform: `translateX(${preview.effectsEnabled ? '18px' : '2px'})` }}
                    />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Live preview column — sticky on desktop */}
        <div className="order-1 min-w-0 lg:order-2">
          <div className="lg:sticky lg:top-0">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-txt-tertiary">
                {t('live_preview')}
              </span>
              <span className="prem-live-dot flex items-center gap-1.5 text-[10px] font-bold text-txt-tertiary">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: accentCss, boxShadow: `0 0 8px ${accentCss}` }}
                />
                {isNetrex ? t('live_preview') : t('preview_only')}
              </span>
            </div>
            <div
              className="rounded-2xl border border-white/[0.08] p-2 shadow-[0_20px_60px_-24px_rgba(0,0,0,0.65)] transition-shadow duration-300"
              style={{ background: 'rgb(var(--interactive-muted) / 0.35)' }}
            >
              <VERTEXAppPreview preview={preview} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Sticky footer ── */}
      <div className="prem-footer sticky bottom-0 -mx-6 -mb-6 mt-6 border-t border-white/[0.07] bg-surface-elevated/85 px-6 py-4 backdrop-blur-xl">
        {onSave ? (
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={resetPreview}
              className="rounded-lg px-3 py-2 text-[11.5px] font-semibold text-txt-tertiary transition-colors hover:bg-white/[0.05] hover:text-txt-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
            >
              {t('reset_preview')}
            </button>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-[12px] font-semibold text-txt-secondary transition-all duration-200 hover:bg-white/[0.07] hover:text-txt-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={() => onSave(preview)}
                className="rounded-lg px-5 py-2 text-[12px] font-bold text-[#0b0b10] transition-all duration-200 hover:brightness-110 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                style={{
                  background: accentCss,
                  boxShadow: `0 6px 20px -6px ${accentCss}66`,
                }}
              >
                {t('save_changes')}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] text-txt-tertiary">
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: accentCss }} />
              {isNetrex ? t('live_preview') : t('preview_only')}
            </div>
            <button
              type="button"
              onClick={resetPreview}
              className="text-[10px] text-txt-tertiary transition-colors hover:text-txt-secondary"
            >
              {t('reset_preview')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

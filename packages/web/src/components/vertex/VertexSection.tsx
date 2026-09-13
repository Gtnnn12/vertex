import { useState, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  ACCENT_PRESETS,
  EFFECTS,
  THEMES,
  applyPreferences,
  getCurrentPreferences,
  initVertexAppearance,
  resolveTheme,
  type AccentChannels,
  type AccentPreset,
  type EffectId,
  type ThemeId,
  type VertexPreferences,
} from '../../utils/vertexTheme';

function rgbColor(p: AccentChannels): string {
  return `rgb(${p[0]} ${p[1]} ${p[2]})`;
}

function rgbAlpha(p: AccentChannels, alpha: number): string {
  return `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${alpha})`;
}

/* ── Selection dot used by every option card (accent-aware) ── */
function SelectionDot({ fill, glow }: { fill?: string; glow?: string }) {
  return (
    <div
      className={`w-[18px] h-[18px] rounded-full flex-shrink-0 flex items-center justify-center transition-all duration-200 ${
        fill ? '' : 'border border-white/[0.12]'
      }`}
      style={fill ? { background: fill, color: '#0b0b10', boxShadow: glow ? `0 2px 10px -2px ${glow}` : undefined } : undefined}
    >
      {!fill && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="m4 12.5 5 5L20 6.5" /></svg>}
    </div>
  );
}

/* ── Accent preview card ── */
function AccentCard({ preset, selected, onSelect }: { preset: AccentPreset; selected: boolean; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(preset.id)}
      className={`group relative flex flex-col rounded-[12px] border text-left overflow-hidden transition-all duration-200 active:scale-[0.99] ${
        selected
          ? 'border-accent-primary/35 bg-white/[0.04] ring-1 ring-accent-primary/20'
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.13] hover:bg-white/[0.035] hover:-translate-y-[1px]'
      }`}
      style={selected ? { boxShadow: `0 10px 32px -16px ${rgbAlpha(preset.primary, 0.55)}` } : undefined}
    >
      {/* Preview strip — the accent framed on the current theme's surface */}
      <div className="relative h-[52px] border-b border-white/[0.05] overflow-hidden bg-surface-chat">
        <div
          className="absolute -top-7 -right-7 w-24 h-24 rounded-full transition-opacity duration-300 pointer-events-none"
          style={{ background: `radial-gradient(circle, ${rgbAlpha(preset.primary, 0.5)} 0%, transparent 70%)`, opacity: selected ? 0.3 : 0.16 }}
        />
        <div className="absolute left-3.5 bottom-3 flex items-center gap-2">
          <div className="w-[18px] h-[18px] rounded-[6px] flex items-center justify-center border border-white/[0.1]" style={{ background: `linear-gradient(135deg, ${rgbColor(preset.primary)}, ${rgbAlpha(preset.primary, 0.65)})` }}>
            <span className="text-[8.5px] font-black leading-none" style={{ color: '#0b0b10' }}>V</span>
          </div>
          <div className="space-y-[5px]">
            <div className="h-[6px] w-12 rounded-full bg-white/[0.14]" />
            <div className="h-[4px] w-8 rounded-full bg-white/[0.07]" />
          </div>
        </div>
        <div className="absolute right-3.5 bottom-3 h-[16px] px-1.5 flex items-center rounded-[5px] border" style={{ borderColor: rgbAlpha(preset.primary, 0.28), background: rgbAlpha(preset.primary, 0.1) }}>
          <span className="w-[6px] h-[6px] rounded-[2px]" style={{ background: rgbColor(preset.primary) }} />
        </div>
      </div>

      {/* Label + selection */}
      <div className="flex items-center gap-2.5 px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold tracking-[-0.01em] text-txt-primary leading-none">{preset.name}</div>
          <div className="mt-[5px] text-[10.5px] font-semibold text-txt-tertiary leading-none uppercase tracking-[0.12em]">{preset.tagline}</div>
        </div>
        <SelectionDot fill={selected ? rgbColor(preset.primary) : undefined} glow={selected ? rgbAlpha(preset.primary, 0.6) : undefined} />
      </div>
    </button>
  );
}

/* ── Effect / theme swatches ── */
function EffectSwatch({ id }: { id: EffectId }) {
  switch (id) {
    case 'minimal':
      return <div className="w-8 h-8 rounded-md bg-white/[0.14] border border-white/[0.12]" />;
    case 'ambient':
      return (
        <div className="relative w-8 h-8 rounded-md bg-white/[0.06] border border-white/[0.09] overflow-hidden">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[rgb(var(--accent-primary-glow)/0.4)] blur-[5px]" />
        </div>
      );
    case 'glass':
      return (
        <div className="relative w-8 h-8 rounded-md bg-white/[0.05] border border-white/[0.1] overflow-hidden">
          <div className="absolute left-2 right-2 top-[7px] h-[3px] rounded-full bg-white/[0.18]" />
          <div className="absolute left-2 right-2 bottom-[7px] h-[3px] rounded-full bg-white/[0.09]" />
        </div>
      );
    case 'glow':
      return (
        <div className="relative w-8 h-8 rounded-md bg-white/[0.03] border border-white/[0.07] flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-[rgb(var(--accent-primary))] shadow-[0_0_12px_2px_rgb(var(--accent-primary-glow)/0.8)]" />
        </div>
      );
  }
}

function ThemeCard({
  theme,
  name,
  description,
  selected,
  onSelect,
  accent,
}: {
  theme: ThemeId;
  name: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
  accent: AccentChannels;
}) {
  const dark = theme !== 'light';

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`group relative flex flex-col rounded-[14px] border text-left overflow-hidden transition-all duration-200 active:scale-[0.99] ${
        selected
          ? 'border-accent-primary/35 bg-white/[0.04] ring-1 ring-accent-primary/20'
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.13] hover:bg-white/[0.035] hover:-translate-y-[1px]'
      }`}
      style={selected ? { boxShadow: '0 10px 32px -16px rgb(var(--accent-primary-glow) / 0.5)' } : undefined}
    >
      {/* Preview — renders the theme on its own mini canvas. Featured, with air around it. */}
      <div className={`relative p-3 ${dark ? 'bg-[#14141d]' : 'bg-[#e8eaf0]'}`}>
        <div
          className={`relative rounded-[10px] h-[84px] overflow-hidden border ${
            dark ? 'bg-[#1b1c26] border-white/[0.09]' : 'bg-[#f5f6fa] border-black/[0.1]'
          }`}
        >
          {/* Mini rail */}
          <div
            className={`absolute inset-y-0 left-0 w-[24px] flex flex-col items-center pt-2.5 gap-2 border-r ${
              dark ? 'border-white/[0.06] bg-white/[0.03]' : 'border-black/[0.07] bg-black/[0.04]'
            }`}
          >
            <span
              className="w-[13px] h-[13px] rounded-[4px] flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${rgbColor(accent)}, ${rgbAlpha(accent, 0.6)})` }}
            >
              <span className="text-[6.5px] font-black leading-none" style={{ color: '#0b0b10' }}>V</span>
            </span>
            <span className={`w-[9px] h-[9px] rounded-[3px] ${dark ? 'bg-white/[0.13]' : 'bg-black/[0.15]'}`} />
            <span className={`w-[9px] h-[9px] rounded-[3px] ${dark ? 'bg-white/[0.13]' : 'bg-black/[0.15]'}`} />
          </div>
          {/* Mini list */}
          <div className="absolute inset-y-0 left-[30px] right-3 py-3 flex flex-col justify-center gap-2">
            <div className={`h-[14px] rounded-[4px] flex items-center px-2 gap-1.5 ${dark ? 'bg-white/[0.09]' : 'bg-black/[0.1]'}`}>
              <span className="w-[7px] h-[7px] rounded-[2px]" style={{ background: rgbColor(accent) }} />
              <span className={`h-[4px] w-9 rounded-full ${dark ? 'bg-white/[0.24]' : 'bg-black/[0.24]'}`} />
            </div>
            <div className={`h-[8px] rounded-[3px] ${dark ? 'bg-white/[0.07]' : 'bg-black/[0.08]'}`} />
            <div className={`h-[8px] rounded-[3px] ${dark ? 'bg-white/[0.05]' : 'bg-black/[0.06]'}`} />
          </div>
        </div>

        {/* Selection badge — top-right, integrated with the preview chrome. */}
        <div
          className={`absolute top-[19px] right-[19px] w-[22px] h-[22px] rounded-full flex items-center justify-center transition-all duration-200 ${
            selected
              ? ''
              : `border shadow-[0_2px_8px_rgba(0,0,0,0.25)] ${dark ? 'border-white/[0.16] bg-[#14141d]' : 'border-black/[0.18] bg-[#e8eaf0]'}`
          }`}
          style={selected ? { background: rgbColor(accent), color: '#0b0b10', boxShadow: `0 2px 10px -2px ${rgbAlpha(accent, 0.6)}` } : undefined}
        >
          {selected && (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="m4 12.5 5 5L20 6.5" />
            </svg>
          )}
        </div>
      </div>

      {/* Label block — spacious product-card composition: name → description → breathing room */}
      <div className="px-[18px] py-5 flex flex-col items-start gap-[9px]">
        <span className="text-[15px] font-bold tracking-[-0.01em] text-txt-primary leading-none">{name}</span>
        <span className={`text-[12px] leading-snug ${selected ? 'text-txt-secondary' : 'text-txt-tertiary'}`}>{description}</span>
      </div>
    </button>
  );
}

/* ── Generic option card for effects + themes ── */
function OptionCard({
  name,
  tagline,
  description,
  selected,
  onSelect,
  swatch,
  accent,
}: {
  name: string;
  tagline: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
  swatch: React.ReactNode;
  accent: AccentChannels;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`group relative flex items-start gap-3 rounded-[12px] border text-left p-3.5 transition-all duration-200 active:scale-[0.99] ${
        selected
          ? 'border-accent-primary/35 bg-white/[0.04] ring-1 ring-accent-primary/20'
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.13] hover:bg-white/[0.035] hover:-translate-y-[1px]'
      }`}
      style={selected ? { boxShadow: '0 10px 32px -16px rgb(var(--accent-primary-glow) / 0.5)' } : undefined}
    >
      <div className={`flex-shrink-0 w-12 h-12 rounded-[9px] flex items-center justify-center border overflow-hidden bg-surface-elevated ${selected ? 'border-accent-primary/30' : 'border-white/[0.06]'}`}>
        {swatch}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold tracking-[-0.01em] text-txt-primary leading-none">{name}</span>
          <span className="text-[10.5px] font-semibold text-txt-tertiary leading-none uppercase tracking-[0.12em]">{tagline}</span>
        </div>
        <div className={`mt-[7px] text-[11.5px] leading-snug ${selected ? 'text-txt-secondary' : 'text-txt-tertiary'}`}>{description}</div>
      </div>
      <div className="flex-shrink-0 pt-[2px]">
        <SelectionDot fill={selected ? rgbColor(accent) : undefined} glow={selected ? rgbAlpha(accent, 0.6) : undefined} />
      </div>
    </button>
  );
}

/* ── Section header ── */
function ModuleHeader({ index, label, title, desc }: { index: string; label: string; title: string; desc: string }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-accent-primary">{index}</span>
        <span className="h-px w-8 bg-white/[0.1]" />
        <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-txt-tertiary">{label}</span>
      </div>
      <h2 className="mt-6 text-[22px] md:text-[24px] font-bold tracking-[-0.03em] text-txt-primary">{title}</h2>
      <p className="mt-3 text-[13px] leading-relaxed text-txt-tertiary max-w-[52ch]">{desc}</p>
    </div>
  );
}

function NowChip({ dot, children }: { dot?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.03] px-2 py-[3px] text-[10.5px] font-semibold text-txt-secondary uppercase tracking-[0.08em]">
      {dot}
      {children}
    </span>
  );
}

export function VertexSection() {
  const { t } = useLanguage();

  useEffect(() => {
    initVertexAppearance();
  }, []);

  const [prefs, setPrefs] = useState<VertexPreferences>(() => getCurrentPreferences());

  const currentAccent = ACCENT_PRESETS.find((p) => p.id === prefs.accent) ?? ACCENT_PRESETS[0];
  const currentEffect = EFFECTS.find((e) => e.id === prefs.effects) ?? EFFECTS[0];
  const currentTheme = THEMES.find((x) => x.id === prefs.theme) ?? THEMES[0];
  const resolvedTheme = resolveTheme(prefs.theme);

  const setAccent = (id: string) => setPrefs(applyPreferences({ accent: id }));
  const setEffects = (id: EffectId) => setPrefs(applyPreferences({ effects: id }));
  const setTheme = (id: ThemeId) => setPrefs(applyPreferences({ theme: id }));

  return (
    <div className="relative flex-1 h-full w-full min-w-0 min-h-0 bg-surface-chat overflow-y-auto">
      {/* Ambient accent wash — keeps the canvas from reading flat, never loud */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{ background: 'radial-gradient(ellipse 900px 420px at 50% -40px, rgb(var(--accent-primary-glow) / 0.06), transparent 70%)' }}
      />

      <div className="relative w-full max-w-[820px] mx-auto px-8 md:px-12 py-12 md:py-16">
        {/* ── Hero ── */}
        <header className="animate-fade-in" style={{ animationDuration: '700ms' }}>
          <div className="flex items-center gap-3">
            <span className="w-[22px] h-[22px] rounded-[7px] bg-white/[0.06] ring-1 ring-white/[0.09] flex items-center justify-center flex-shrink-0">
              <span className="text-[11px] font-black leading-none text-txt-primary">V</span>
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.34em] text-txt-tertiary">vertex</span>
            <span className="h-px flex-1 bg-gradient-to-r from-white/[0.1] to-transparent" />
            <span className="text-[10px] font-semibold text-txt-tertiary/80 tabular-nums tracking-[0.08em]">v0.1.0</span>
          </div>

          <h1 className="mt-10 text-[52px] md:text-[64px] font-bold tracking-[-0.045em] leading-[0.96] text-txt-primary">
            Vertex<span className="text-accent-primary">.</span>
          </h1>

          <p className="mt-6 text-[15px] md:text-[16px] leading-relaxed text-txt-secondary max-w-[46ch]">
            {t('vertex_tagline')}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11.5px] font-medium text-txt-tertiary">
            <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-[10px] py-[3px] font-semibold tabular-nums text-txt-secondary">v0.1.0</span>
            <span className="w-[3px] h-[3px] rounded-full bg-txt-tertiary/50" />
            <span>{t('vertex_selfhosted')}</span>
            <span className="w-[3px] h-[3px] rounded-full bg-txt-tertiary/50" />
            <span>{t('vertex_opensource')}</span>
            <span className="w-[3px] h-[3px] rounded-full bg-txt-tertiary/50" />
            <span>{t('vertex_federated')}</span>
          </div>
        </header>

        {/* ── Composition: modules + live preview scaffold ── */}
        <div className="mt-16 md:mt-20 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px] gap-12 md:gap-10 items-start">
          {/* Main column — Appearance, Effects, Theme */}
          <section className="flex flex-col gap-14">
            {/* 01 — Appearance */}
            <div>
              <ModuleHeader index="01" label={t('vertex_appearance')} title={t('vertex_appearance_title')} desc={t('vertex_appearance_desc')} />
              <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {ACCENT_PRESETS.map((preset) => (
                  <AccentCard key={preset.id} preset={preset} selected={preset.id === currentAccent.id} onSelect={setAccent} />
                ))}
              </div>
              <p className="mt-4 text-[11.5px] leading-relaxed text-txt-tertiary/80 max-w-[52ch]">{t('vertex_presets_note')}</p>
            </div>

            {/* 02 — Effects */}
            <div>
              <ModuleHeader index="02" label={t('vertex_effects')} title={t('vertex_effects_title')} desc={t('vertex_effects_desc')} />
              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {EFFECTS.map((effect) => (
                  <OptionCard
                    key={effect.id}
                    name={effect.name}
                    tagline={effect.tagline}
                    description={t(effect.descKey)}
                    selected={effect.id === prefs.effects}
                    onSelect={() => setEffects(effect.id)}
                    swatch={<EffectSwatch id={effect.id} />}
                    accent={currentAccent.primary}
                  />
                ))}
              </div>
            </div>

            {/* 03 — Theme */}
            <div>
              <ModuleHeader index="03" label={t('vertex_themes')} title={t('vertex_themes_title')} desc={t('vertex_themes_desc')} />
              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:max-w-[560px] sm:mx-auto">
                {THEMES.map((theme) => (
                  <ThemeCard
                    key={theme.id}
                    theme={theme.id}
                    name={theme.name}
                    description={theme.id === 'light' ? t('vertex_theme_light_desc') : t('vertex_theme_dark_desc')}
                    selected={theme.id === prefs.theme}
                    onSelect={() => setTheme(theme.id)}
                    accent={currentAccent.primary}
                  />
                ))}
              </div>
            </div>
          </section>

          {/* Aside — live current settings */}
          <aside className="md:sticky md:top-8 flex flex-col gap-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-txt-tertiary">{t('vertex_now_label')}</div>

            {/* Active selections */}
            <div className="flex flex-wrap gap-1.5">
              <NowChip dot={<span className="w-[7px] h-[7px] rounded-[2px]" style={{ background: rgbColor(currentAccent.primary) }} />}>
                {currentAccent.name}
              </NowChip>
              <NowChip>{currentEffect.name}</NowChip>
              <NowChip>{prefs.theme === 'system' ? `${currentTheme.name} → ${resolvedTheme}` : currentTheme.name}</NowChip>
            </div>

            {/* Mock application rendering the current accent */}
            <div className="rounded-[14px] border border-white/[0.06] bg-white/[0.02] overflow-hidden shadow-[0_24px_60px_-42px_rgba(0,0,0,0.9)]">
              <div className="flex items-center gap-1.5 px-3.5 h-9 border-b border-white/[0.05]">
                <span className="w-[7px] h-[7px] rounded-full bg-white/[0.1]" />
                <span className="w-[7px] h-[7px] rounded-full bg-white/[0.1]" />
                <span className="w-[7px] h-[7px] rounded-full" style={{ background: rgbAlpha(currentAccent.primary, 0.5) }} />
                <span className="ml-auto text-[9px] font-semibold tracking-[0.12em] text-txt-tertiary/70 uppercase">vertex</span>
              </div>

              <div className="p-3">
                <div className="rounded-[10px] border border-white/[0.06] bg-surface-chat overflow-hidden">
                  <div className="flex h-[132px]">
                    {/* Rail */}
                    <div className="w-[34px] flex flex-col items-center pt-2 gap-2 border-r border-white/[0.05] bg-white/[0.015]">
                      <span className="w-[18px] h-[18px] rounded-[6px] flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${rgbColor(currentAccent.primary)}, ${rgbAlpha(currentAccent.primary, 0.6)})` }}>
                        <span className="text-[8.5px] font-black leading-none" style={{ color: '#0b0b10' }}>V</span>
                      </span>
                      <span className="w-[10px] h-[10px] rounded-[4px] bg-white/[0.08]" />
                      <span className="w-[10px] h-[10px] rounded-[4px] bg-white/[0.08]" />
                      <span className="w-[10px] h-[10px] rounded-[4px]" style={{ background: rgbAlpha(currentAccent.primary, 0.55) }} />
                    </div>
                    {/* List */}
                    <div className="flex-1 px-2.5 pt-2.5 pb-2 space-y-1.5">
                      <div
                        className="h-[18px] rounded-[5px] flex items-center px-1.5 border"
                        style={{ background: rgbAlpha(currentAccent.primary, 0.1), borderColor: rgbAlpha(currentAccent.primary, 0.28) }}
                      >
                        <span className="w-[7px] h-[7px] rounded-[2px]" style={{ background: rgbColor(currentAccent.primary) }} />
                        <span className="ml-1.5 w-10 h-[4px] rounded-full" style={{ background: 'rgba(255, 255, 255, 0.28)' }} />
                      </div>
                      <div className="h-[14px] rounded-[4px] bg-white/[0.05]" />
                      <div className="h-[14px] rounded-[4px] bg-white/[0.03]" />
                      <div className="h-[14px] rounded-[4px] bg-white/[0.05]" />
                      <div className="h-[14px] rounded-[4px] bg-white/[0.03]" />
                      <div className="mt-2 ml-6 h-[20px] rounded-[10px] border flex items-center px-2" style={{ borderColor: rgbAlpha(currentAccent.primary, 0.3), background: rgbAlpha(currentAccent.primary, 0.08) }}>
                        <span className="w-[6px] h-[6px] rounded-full" style={{ background: rgbColor(currentAccent.primary) }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-[11.5px] leading-relaxed text-txt-tertiary/80">{t('vertex_theme_desc')}</p>
          </aside>
        </div>

        {/* ── Footer ── */}
        <footer className="mt-16 border-t border-white/[0.06] pt-6 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-txt-tertiary/80">{t('vertex_foot_more')}</span>
          <span className="text-[11px] text-txt-tertiary/50 tabular-nums">v0.1.0 — © {new Date().getFullYear()} Vertex</span>
        </footer>
      </div>
    </div>
  );
}
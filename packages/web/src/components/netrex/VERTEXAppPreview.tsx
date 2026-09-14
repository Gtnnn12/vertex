import { useMemo } from 'react';

// ─── Preview state model ────────────────────────────────────────────────────

export interface ColorValue {
  hex: string;
  rgb: string;
}

export interface PreviewState {
  accentColor: ColorValue;
  primaryColor: ColorValue;
  secondaryColor: ColorValue;
  bgColor: ColorValue;
  surfaceColor: ColorValue;
  textColor: ColorValue;
  mutedColor: ColorValue;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  density: 'compact' | 'comfortable' | 'spacious';
  cornerRadius: number;
  borderIntensity: number;
  glowIntensity: number;
  backgroundType: 'solid' | 'gradient';
  backgroundGradient: string;
  backgroundSolid: string;
  effectsEnabled: boolean;
}

export const DEFAULT_PREVIEW: PreviewState = {
  accentColor: { hex: '#82efac', rgb: '130, 239, 172' },
  primaryColor: { hex: '#13131a', rgb: '19, 19, 26' },
  secondaryColor: { hex: '#1a1a23', rgb: '26, 26, 35' },
  bgColor: { hex: '#13131a', rgb: '19, 19, 26' },
  surfaceColor: { hex: '#1a1a23', rgb: '26, 26, 35' },
  textColor: { hex: '#f4f4f5', rgb: '244, 244, 245' },
  mutedColor: { hex: '#71717a', rgb: '113, 113, 122' },
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 14,
  fontWeight: '400',
  density: 'comfortable',
  cornerRadius: 8,
  borderIntensity: 5,
  glowIntensity: 5,
  backgroundType: 'solid',
  backgroundGradient: 'linear-gradient(135deg, #13131a 0%, #1a1a23 50%, #0f0f17 100%)',
  backgroundSolid: '#13131a',
  effectsEnabled: true,
};

export function hexToRgb(hex: string): ColorValue {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return {
    hex: `#${clean.toLowerCase()}`,
    rgb: `${r}, ${g}, ${b}`,
  };
}

/** Rebuilds a ColorValue from a hex string so the rgb triple always stays consistent. */
function normalizeColor(value: Partial<ColorValue> | undefined, fallback: ColorValue): ColorValue {
  if (value && /^#([0-9a-fA-F]{6})$/.test(value.hex ?? '')) return hexToRgb(value.hex!);
  return fallback;
}

/**
 * Merge a partial stored state (from localStorage) over the defaults.
 * Color pairs are rebuilt from their hex so rgb can never drift out of sync.
 */
export function buildPreviewState(partial?: Partial<PreviewState>): PreviewState {
  if (!partial) return DEFAULT_PREVIEW;
  return {
    accentColor: normalizeColor(partial.accentColor, DEFAULT_PREVIEW.accentColor),
    primaryColor: normalizeColor(partial.primaryColor, DEFAULT_PREVIEW.primaryColor),
    secondaryColor: normalizeColor(partial.secondaryColor, DEFAULT_PREVIEW.secondaryColor),
    bgColor: normalizeColor(partial.bgColor, DEFAULT_PREVIEW.bgColor),
    surfaceColor: normalizeColor(partial.surfaceColor, DEFAULT_PREVIEW.surfaceColor),
    textColor: normalizeColor(partial.textColor, DEFAULT_PREVIEW.textColor),
    mutedColor: normalizeColor(partial.mutedColor, DEFAULT_PREVIEW.mutedColor),
    fontFamily: typeof partial.fontFamily === 'string' ? partial.fontFamily : DEFAULT_PREVIEW.fontFamily,
    fontSize: typeof partial.fontSize === 'number' ? partial.fontSize : DEFAULT_PREVIEW.fontSize,
    fontWeight: typeof partial.fontWeight === 'string' ? partial.fontWeight : DEFAULT_PREVIEW.fontWeight,
    density: partial.density === 'compact' || partial.density === 'comfortable' || partial.density === 'spacious'
      ? partial.density
      : DEFAULT_PREVIEW.density,
    cornerRadius: typeof partial.cornerRadius === 'number' ? partial.cornerRadius : DEFAULT_PREVIEW.cornerRadius,
    borderIntensity: typeof partial.borderIntensity === 'number' ? partial.borderIntensity : DEFAULT_PREVIEW.borderIntensity,
    glowIntensity: typeof partial.glowIntensity === 'number' ? partial.glowIntensity : DEFAULT_PREVIEW.glowIntensity,
    backgroundType: partial.backgroundType === 'solid' || partial.backgroundType === 'gradient'
      ? partial.backgroundType
      : DEFAULT_PREVIEW.backgroundType,
    backgroundGradient: typeof partial.backgroundGradient === 'string' ? partial.backgroundGradient : DEFAULT_PREVIEW.backgroundGradient,
    backgroundSolid: typeof partial.backgroundSolid === 'string' ? partial.backgroundSolid : DEFAULT_PREVIEW.backgroundSolid,
    effectsEnabled: typeof partial.effectsEnabled === 'boolean' ? partial.effectsEnabled : DEFAULT_PREVIEW.effectsEnabled,
  };
}

// ─── Integrated VERTEX layout preview ───────────────────────────────────────

interface PreviewSeedServer {
  name: string;
  icon: string | null;
}

const PRESENCE_COLORS = {
  online: '#4ade80',
  idle: '#fbbf24',
  dnd: '#f87171',
  offline: '#52525b',
} as const;

const SAMPLE_MEMBERS = [
  { name: 'Alex', presence: 'online' as const, initial: 'A', tone: 'accent' },
  { name: 'Mario', presence: 'idle' as const, initial: 'M', tone: 'surface' },
  { name: 'Sara', presence: 'dnd' as const, initial: 'S', tone: 'secondary' },
  { name: 'Nora', presence: 'offline' as const, initial: 'N', tone: 'muted' },
];

const SAMPLE_CHANNELS = [
  { kind: 'text' as const, name: 'bienvenida', active: false },
  { kind: 'text' as const, name: 'general', active: true },
  { kind: 'text' as const, name: 'gaming', active: false },
  { kind: 'text' as const, name: 'música', active: false },
  { kind: 'voice' as const, name: 'Sala general', active: false },
];

const SAMPLE_MESSAGES = [
  { initial: 'A', tone: 'accent', name: 'Alex', time: '12:00', text: '¡Hola a todos! ¿Cómo va la semana?' },
  { initial: 'M', tone: 'surface', name: 'Mario', time: '12:01', text: 'Todo bien por aquí, ¡buenas!' },
];

interface VERTEXAppPreviewProps {
  preview: PreviewState;
  /** Optional real-space seed. Undefined → derived from the user's first joined space. Null → sample identity. */
  seedServer?: PreviewSeedServer | null;
  className?: string;
}

export function VERTEXAppPreview({ preview, seedServer, className = '' }: VERTEXAppPreviewProps) {

  // Mock identity ONLY: the preview is generic VERTEX marketing content, so
  // it must never leak the user's real first space (a real server name like
  // "Citas" would surface in every personalization preview).
  const server: PreviewSeedServer = useMemo(() => {
    if (seedServer) return seedServer;
    return { name: 'Comunidad Vertex', icon: null };
  }, [seedServer]);

  const scale = preview.fontSize / 14;

  // Density is expressed as the multiplier applied to base paddings/gaps.
  const densityScale =
    preview.density === 'compact' ? 0.72 :
    preview.density === 'spacious' ? 1.28 : 1;

  const pad = (base: number) => `${base * scale * densityScale}px`;
  const gap = (base: number) => `${base * scale * densityScale}px`;

  const bg = preview.backgroundType === 'gradient' ? preview.backgroundGradient : preview.backgroundSolid;
  const hairline = preview.borderIntensity > 0
    ? `rgba(${preview.mutedColor.rgb}, ${0.05 + preview.borderIntensity * 0.011})`
    : 'transparent';
  const radius = `${preview.cornerRadius}px`;
  const innerRadius = `${Math.max(2, Math.round(preview.cornerRadius * 0.5))}px`;
  const accentSoft = `rgba(${preview.accentColor.rgb}, 0.14)`;
  const accentText = preview.accentColor.hex;
  const text = preview.textColor.hex;
  const textDim = `rgba(${preview.textColor.rgb}, 0.72)`;
  const textMuted = `rgba(${preview.mutedColor.rgb}, 0.75)`;
  const primary = preview.primaryColor.hex;
  const secondary = preview.secondaryColor.hex;
  const surface = preview.surfaceColor.hex;
  const glow = preview.effectsEnabled && preview.glowIntensity > 0
    ? `0 0 ${8 + preview.glowIntensity * 1.4}px rgba(${preview.accentColor.rgb}, ${0.22 + preview.glowIntensity * 0.02})`
    : 'none';

  const serverIconUrl =
    server.icon && (server.icon.startsWith('http') || server.icon.startsWith('/'))
      ? server.icon
      : server.icon
        ? `/api/uploads/${server.icon}`
        : null;

  return (
    <div
      className={`w-full select-none overflow-hidden ${className}`}
      style={{
        background: bg,
        borderRadius: radius,
        fontFamily: preview.fontFamily,
        fontSize: `${preview.fontSize}px`,
        fontWeight: preview.fontWeight,
        lineHeight: 1.4,
      }}
      aria-hidden
    >
      {/* Row: rail | channel sidebar | chat | members */}
      <div className="flex">
        {/* ── Server rail ── */}
        <div
          className="flex flex-col items-center flex-shrink-0"
          style={{ width: `${46 * scale}px`, padding: `${pad(12)} 0`, gap: gap(10), background: secondary }}
        >
          {[server, { name: 'NETREX', icon: null }].map((s, i) => (
            <div
              key={i === 0 ? server.name : s.name}
              className="flex items-center justify-center overflow-hidden"
              style={{
                width: `${30 * scale}px`,
                height: `${30 * scale}px`,
                borderRadius: innerRadius,
                background: i === 0 ? accentSoft : 'rgba(255,255,255,0.04)',
                boxShadow: i === 0 ? glow : 'none',
                border: `1px solid ${i === 0 ? `rgba(${preview.accentColor.rgb}, 0.35)` : 'rgba(255,255,255,0.05)'}`,
              }}
            >
              {i === 0 && serverIconUrl ? (
                <img src={serverIconUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span
                  className="font-bold"
                  style={{ fontSize: `${12 * scale}px`, color: i === 0 ? accentText : textMuted }}
                >
                  {(i === 0 ? server.name : s.name).charAt(0).toUpperCase()}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* ── Channel sidebar ── */}
        <div
          className="flex flex-col flex-shrink-0"
          style={{ width: `${168 * scale}px`, background: secondary, borderRight: `1px solid ${hairline}` }}
        >
          {/* Server identity */}
          <div
            className="flex items-center gap-2.5"
            style={{ padding: `${pad(10)} ${pad(8)}`, borderBottom: `1px solid ${hairline}` }}
          >
            <div
              className="flex items-center justify-center flex-shrink-0 overflow-hidden"
              style={{
                width: `${22 * scale}px`,
                height: `${22 * scale}px`,
                borderRadius: innerRadius,
                background: accentSoft,
                color: accentText,
                fontSize: `${11 * scale}px`,
                fontWeight: '700',
                border: `1px solid ${hairline}`,
              }}
            >
              {serverIconUrl ? (
                <img src={serverIconUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                server.name.charAt(0).toUpperCase()
              )}
            </div>
            <span className="font-bold truncate" style={{ fontSize: `${12 * scale}px`, color: text, letterSpacing: '-0.01em' }}>
              {server.name}
            </span>
          </div>

          {/* Channel list */}
          <div className="flex-1 min-h-0" style={{ padding: `${pad(8)} ${pad(4)}`, display: 'flex', flexDirection: 'column', gap: gap(2) }}>
            {SAMPLE_CHANNELS.map((ch) => (
              <div
                key={ch.name}
                className="flex items-center gap-2 rounded"
                style={{
                  padding: `${pad(3.5)} ${pad(4)}`,
                  background: ch.active ? accentSoft : 'transparent',
                  color: ch.active ? accentText : textDim,
                  fontSize: `${10.5 * scale}px`,
                  fontWeight: ch.active ? '600' : '400',
                }}
              >
                {ch.kind === 'text' ? (
                  <span className="opacity-70" style={{ marginRight: -1 }}>#</span>
                ) : (
                  <svg width={10 * scale} height={10 * scale} viewBox="0 0 24 24" fill="currentColor" className="flex-shrink-0 opacity-70">
                    <path d="M3 9a2 2 0 00-2 2v2a2 2 0 002 2h1.6l3.6 3.6A1 1 0 008 18v-9H3z" />
                    <path d="M12 9.5a4 4 0 010 5M14.8 7a7 7 0 010 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
                <span className="truncate">{ch.name}</span>
                {ch.kind === 'voice' && (
                  <span
                    className="flex-shrink-0 rounded-full"
                    style={{ width: `${5 * scale}px`, height: `${5 * scale}px`, background: 'rgb(134,239,172)', opacity: 0.85, marginLeft: 'auto' }}
                  />
                )}
                {ch.active && (
                  <span className="ml-auto flex-shrink-0 flex gap-px">
                    <span className="text" style={{ fontSize: `${8 * scale}px`, opacity: 0.8 }}>{"▶"}</span>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Chat ── */}
        <div className="flex-1 min-w-0 flex flex-col" style={{ background: primary }}>
          {/* Channel header */}
          <div
            className="flex items-center justify-between"
            style={{ padding: `${pad(8)} ${pad(10)}`, borderBottom: `1px solid ${hairline}` }}
          >
            <span className="font-semibold truncate" style={{ fontSize: `${11.5 * scale}px`, color: text }}>
              <span style={{ color: textMuted, marginRight: '0.35em' }}>#</span>general
            </span>
            <div className="flex items-center gap-1.5" style={{ opacity: 0.6 }}>
              <svg width={10 * scale} height={10 * scale} viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2" strokeLinecap="round">
                <path d="M1 8v8M5 5v14M9 11v6M13 2v20M17 7v10M21 13v4" />
              </svg>
              <svg width={10 * scale} height={10 * scale} viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2" strokeLinecap="round">
                <path d="M8 6l6-2v14l-6 2V6zM20 6l2-1v14l-2 1V6z" fill="currentColor" stroke="none" />
              </svg>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 min-h-0 flex flex-col justify-end" style={{ padding: `${pad(8)} ${pad(10)}`, gap: gap(6) }}>
            {SAMPLE_MESSAGES.map((m) => (
              <div key={m.name} className="flex" style={{ gap: gap(7) }}>
                <div
                  className="flex-shrink-0 flex items-center justify-center overflow-hidden rounded-full"
                  style={{
                    width: `${24 * scale}px`,
                    height: `${24 * scale}px`,
                    background:
                      m.tone === 'accent' ? accentSoft
                      : m.tone === 'surface' ? `rgba(255,255,255,0.05)`
                      : 'rgba(0,0,0,0.25)',
                    color: m.tone === 'accent' ? accentText : textDim,
                    fontSize: `${10 * scale}px`,
                    fontWeight: '700',
                    border: `1px solid ${hairline}`,
                  }}
                >
                  {m.initial}
                </div>
                <div className="min-w-0">
                  <div className="flex items-baseline" style={{ gap: gap(4) }}>
                    <span className="font-semibold" style={{ fontSize: `${10.5 * scale}px`, color: text }}>
                      {m.name}
                    </span>
                    <span style={{ fontSize: `${8.5 * scale}px`, color: textMuted }}>{m.time}</span>
                  </div>
                  <div className="truncate" style={{ fontSize: `${10 * scale}px`, color: textDim }}>{m.text}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Input pill */}
          <div style={{ padding: `0 ${pad(10)} ${pad(8)}` }}>
            <div
              className="flex items-center gap-2"
              style={{
                padding: `${pad(4.5)} ${pad(6)}`,
                borderRadius: innerRadius,
                background: surface,
                border: `1px solid ${hairline}`,
              }}
            >
              <span className="flex-1 truncate" style={{ fontSize: `${9.5 * scale}px`, color: textMuted }}>
                Escribe un mensaje…
              </span>
              {preview.effectsEnabled && (
                <span className="flex items-center gap-1" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="animate-bounce"
                      style={{
                        width: `${4 * scale}px`,
                        height: `${4 * scale}px`,
                        borderRadius: 999,
                        background: accentText,
                        animationDelay: `${i * 0.15}s`,
                        animationDuration: '1.2s',
                      }}
                    />
                  ))}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Members sidebar ── */}
        <div
          className="flex-shrink-0 flex flex-col"
          style={{ width: `${118 * scale}px`, background: secondary, borderLeft: `1px solid ${hairline}` }}
        >
          <div
            className="flex items-center justify-between"
            style={{ padding: `${pad(8)} ${pad(8)}`, borderBottom: `1px solid ${hairline}` }}
          >
            <span className="font-bold uppercase" style={{ fontSize: `${8 * scale}px`, letterSpacing: '0.14em', color: textMuted }}>
              Miembros
            </span>
            <span style={{ fontSize: `${9 * scale}px`, color: textMuted }}>
              {SAMPLE_MEMBERS.filter((m) => m.presence !== 'offline').length} <span style={{ color: accentText, opacity: 0.9 }}>•</span> 4
            </span>
          </div>
          <div className="flex-1 min-h-0" style={{ padding: `${pad(6)} ${pad(4)}`, display: 'flex', flexDirection: 'column', gap: gap(5) }}>
            {SAMPLE_MEMBERS.map((m) => (
              <div key={m.name} className="flex items-center" style={{ gap: gap(5) }}>
                <div className="relative flex-shrink-0">
                  <div
                    className="flex items-center justify-center rounded-full"
                    style={{
                      width: `${18 * scale}px`,
                      height: `${18 * scale}px`,
                      background: m.tone === 'accent' ? accentSoft : m.tone === 'muted' ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.05)',
                      color: m.tone === 'accent' ? accentText : textDim,
                      fontSize: `${8.5 * scale}px`,
                      fontWeight: '700',
                      border: `1px solid ${hairline}`,
                    }}
                  >
                    {m.initial}
                  </div>
                  <span
                    className="absolute rounded-full"
                    style={{
                      width: `${6 * scale}px`,
                      height: `${6 * scale}px`,
                      right: -0.5,
                      bottom: -0.5,
                      background: PRESENCE_COLORS[m.presence],
                      border: `1.5px solid ${preview.secondaryColor.hex}`,
                    }}
                  />
                </div>
                <span className="truncate" style={{ fontSize: `${10 * scale}px`, color: m.presence === 'offline' ? textMuted : text }}>
                  {m.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
import { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { PersonalizationLanding } from './PersonalizationLanding';
import { NetrexBridge } from './NetrexBridge';
import { MusicStylePicker } from './MusicStylePicker';
import { NetrexPurchaseModal } from './NetrexPurchaseModal';

// ─── Entitlement status header ──────────────────────────────────────────────
// NetrexSection does NOT render its own status banner. The single status header
// lives in NetrexBridge.HubStatusHeader — rendered once, right below.

// ─── Feature card ──────────────────────────────────────────────────────────

function FeatureCard({
  icon,
  title,
  description,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  accent: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group relative flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 transition-all duration-300 cursor-default"
      style={{
        boxShadow: hovered
          ? `0 8px 32px -12px ${accent}30, 0 0 0 1px ${accent}15`
          : '0 4px 16px -8px rgba(0,0,0,0.3)',
      }}
    >
      <div
        className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] transition-all duration-300"
        style={hovered ? { borderColor: `${accent}40`, background: `${accent}10` } : undefined}
      >
        {icon}
      </div>
      <h3 className="text-[15px] font-bold tracking-[-0.01em] text-txt-primary">{title}</h3>
      <p className="mt-2 text-[12.5px] leading-relaxed text-txt-tertiary">{description}</p>
      {hovered && (
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300"
          style={{ background: `radial-gradient(circle at 50% 0%, ${accent}08, transparent 60%)` }}
        />
      )}
    </div>
  );
}

// ─── Feature icons ─────────────────────────────────────────────────────────

function PaletteIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-txt-secondary">
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-txt-secondary">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function ServerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-txt-secondary">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-txt-secondary">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function StreamingIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-txt-secondary">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-txt-secondary">
      <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" />
      <path d="M5 3l.5 2L7 5.5 5.5 6 5 8l-.5-2L3 5.5 4.5 5 5 3z" />
      <path d="M19 17l.5 2 1.5.5-1.5.5-.5 2-.5-2-1.5-.5 1.5-.5.5-2z" />
    </svg>
  );
}

function SparkleFillIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-txt-secondary">
      <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" />
    </svg>
  );
}

function BadgeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-txt-secondary">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

function ThemeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-txt-secondary">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor" opacity=".3" />
    </svg>
  );
}

function PresenceIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-txt-secondary">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function CosmeticsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-txt-secondary">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

// ─── Section header ─────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-accent-peach">✦</span>
      <span className="h-px flex-1 bg-gradient-to-r from-white/[0.08] to-transparent" />
    </div>
  );
}

// ─── VERTSERVER preview mockup ─────────────────────────────────────────────

function VertservPreview() {
  return (
    <div className="relative rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
      {/* Mock server header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05]">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-peach/30 to-accent-rose/20 border border-accent-peach/20 flex items-center justify-center">
          <span className="text-[16px]">✦</span>
        </div>
        <div>
          <div className="text-[13px] font-bold text-txt-primary">My Server</div>
          <div className="text-[10px] text-accent-peach">Premium</div>
        </div>
        <div className="ml-auto flex gap-1.5">
          <div className="w-6 h-6 rounded-md bg-white/[0.04] border border-white/[0.06]" />
          <div className="w-6 h-6 rounded-md bg-white/[0.04] border border-white/[0.06]" />
          <div className="w-6 h-6 rounded-md bg-accent-peach/15 border border-accent-peach/20 flex items-center justify-center">
            <span className="text-[8px] text-accent-peach">✦</span>
          </div>
        </div>
      </div>
      {/* Animated banner mockup */}
      <div className="h-20 bg-gradient-to-r from-accent-peach/15 via-accent-rose/15 to-accent-lavender/15 relative overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(252,165,165,0.1)_0%,rgba(196,181,253,0.1)_50%,rgba(125,211,252,0.1)_100%)]" />
        {/* Animated wave lines */}
        <div className="absolute bottom-0 left-0 right-0 h-6 opacity-20">
          <svg viewBox="0 0 400 24" className="w-full h-full" preserveAspectRatio="none">
            <path d="M0,12 Q50,0 100,12 T200,12 T300,12 T400,12" fill="none" stroke="rgba(252,165,165,0.5)" strokeWidth="1" />
            <path d="M0,18 Q50,6 100,18 T200,18 T300,18 T400,18" fill="none" stroke="rgba(196,181,253,0.5)" strokeWidth="1" />
          </svg>
        </div>
        <div className="absolute bottom-2 left-3 flex gap-2">
          <div className="px-2 py-0.5 rounded-md bg-white/[0.08] border border-white/[0.1] text-[9px] font-semibold text-txt-secondary backdrop-blur-sm">Animated Banner</div>
          <div className="px-2 py-0.5 rounded-md bg-white/[0.08] border border-white/[0.1] text-[9px] font-semibold text-accent-peach backdrop-blur-sm">✦ Netrex</div>
        </div>
      </div>
      {/* Category pills */}
      <div className="px-4 py-3 border-t border-white/[0.04]">
        <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-txt-tertiary mb-2">Identity</div>
        <div className="flex flex-wrap gap-1.5">
          {['Custom Icon', 'Animated Banner', 'Custom Accent', 'Description'].map((f) => (
            <span key={f} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.04] border border-white/[0.06] text-[10px] text-txt-secondary">
              <span className="w-1 h-1 rounded-full bg-accent-peach/60" />{f}
            </span>
          ))}
        </div>
      </div>
      <div className="px-4 py-3 border-t border-white/[0.04]">
        <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-txt-tertiary mb-2">Appearance</div>
        <div className="flex flex-wrap gap-1.5">
          {['Server Theme', 'Gradients', 'Member Layouts'].map((f) => (
            <span key={f} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.04] border border-white/[0.06] text-[10px] text-txt-secondary">
              <span className="w-1 h-1 rounded-full bg-accent-lavender/60" />{f}
            </span>
          ))}
        </div>
      </div>
      <div className="px-4 py-3 border-t border-white/[0.04]">
        <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-txt-tertiary mb-2">Community</div>
        <div className="flex flex-wrap gap-1.5">
          {['Activity Panel', 'Stats', 'Widgets'].map((f) => (
            <span key={f} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.04] border border-white/[0.06] text-[10px] text-txt-secondary">
              <span className="w-1 h-1 rounded-full bg-accent-mint/60" />{f}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Activity Member Panel preview ──────────────────────────────────────────

function ActivityPanelPreview({ t }: { t: (key: string) => string }) {
  const [activeMode, setActiveMode] = useState<'standard' | 'compact' | 'activity' | 'cards'>('activity');

  const members = [
    { name: 'Alice', status: 'online', activity: 'Playing Valorant', activityType: 'playing', color: '#86efac', role: 'Admin' },
    { name: 'Bob', status: 'online', activity: 'Listening to Spotify', activityType: 'listening', color: '#7dd3fc', role: null },
    { name: 'Charlie', status: 'idle', activity: 'In a voice channel', activityType: 'voice', color: '#fcd34d', role: 'Moderator' },
    { name: 'Diana', status: 'online', activity: 'Watching YouTube', activityType: 'watching', color: '#c4b5fd', role: null },
    { name: 'Eve', status: 'offline', activity: '', activityType: null, color: '#6b7280', role: null },
    { name: 'Frank', status: 'dnd', activity: 'In a meeting', activityType: 'focus', color: '#fda4af', role: null },
    { name: 'Grace', status: 'online', activity: 'Building VERTEX', activityType: 'working', color: '#86efac', role: 'Owner' },
    { name: 'Henry', status: 'idle', activity: 'Editing a document', activityType: 'focus', color: '#fcd34d', role: null },
  ];

  const modeLabels = {
    standard: t('netrex_activity_mode_standard'),
    compact: t('netrex_activity_mode_compact'),
    activity: t('netrex_activity_mode_activity'),
    cards: t('netrex_activity_mode_cards'),
  };

  return (
    <div className="relative rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
      {/* Mode tabs */}
      <div className="flex items-center border-b border-white/[0.05]">
        {(['standard', 'compact', 'activity', 'cards'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setActiveMode(mode)}
            className={`flex-1 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] transition-all duration-200 border-b-2 ${
              activeMode === mode
                ? 'text-accent-peach border-accent-peach bg-accent-peach/5'
                : 'text-txt-tertiary border-transparent hover:text-txt-secondary hover:bg-white/[0.02]'
            }`}
          >
            {modeLabels[mode]}
          </button>
        ))}
      </div>

      {activeMode === 'activity' && (
        <>
          {/* Group members header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-bold text-txt-primary">{t('netrex_activity_group_members')}</span>
              <span className="text-[10px] text-txt-tertiary">{members.length}</span>
            </div>
            <button className="text-[10px] font-semibold text-accent-primary hover:text-accent-primary/80 transition-colors px-2 py-1 rounded-md hover:bg-accent-primary/10">
              {t('netrex_activity_invite')}
            </button>
          </div>
          {/* Member grid */}
          <div className="p-3 grid grid-cols-4 gap-2">
            {members.map((m) => (
              <div key={m.name} className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition-colors">
                <div className="relative">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent-peach/20 to-accent-rose/20 border-2 flex items-center justify-center text-[10px] font-bold text-txt-secondary"
                    style={{ borderColor: m.color + '40' }}>
                    {m.name[0]}
                  </div>
                  <div
                    className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-surface-base"
                    style={{ background: m.color }}
                  />
                  {m.role && (
                    <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-accent-amber border border-surface-base flex items-center justify-center">
                      <span className="text-[6px]">★</span>
                    </div>
                  )}
                </div>
                <span className="text-[9px] font-medium text-txt-secondary truncate w-full text-center">{m.name}</span>
              </div>
            ))}
          </div>
          {/* Activity section */}
          <div className="px-4 py-3 border-t border-white/[0.05]">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent-peach">✦ {t('netrex_activity_active_now')}</span>
              <span className="h-px flex-1 bg-white/[0.05]" />
            </div>
            <div className="space-y-2.5">
              {members.slice(0, 3).filter(m => m.activity).map((m) => (
                <div key={m.name} className="flex items-center gap-3 py-1.5 px-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-peach/20 to-accent-rose/20 flex items-center justify-center text-[10px] font-bold text-txt-secondary flex-shrink-0">
                    {m.name[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium text-txt-primary truncate">{m.name}</div>
                    <div className="text-[10px] text-txt-tertiary truncate flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: m.color }} />
                      {m.activity}
                    </div>
                  </div>
                  <span className="text-[9px] text-txt-tertiary flex-shrink-0">2m ago</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {activeMode === 'cards' && (
        <div className="p-3 space-y-2">
          {members.slice(0, 4).map((m) => (
            <div key={m.name} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition-colors">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-peach/20 to-accent-rose/20 border border-white/[0.08] flex items-center justify-center text-[12px] font-bold text-txt-secondary">
                {m.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold text-txt-primary truncate">{m.name}</span>
                  {m.role && (
                    <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-accent-amber/20 text-accent-amber border border-accent-amber/20">{m.role}</span>
                  )}
                </div>
                <div className="text-[10px] text-txt-tertiary truncate flex items-center gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.color }} />
                  {m.activity || 'Offline'}
                </div>
              </div>
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: m.color }} />
            </div>
          ))}
        </div>
      )}

      {activeMode === 'standard' && (
        <div className="p-2 space-y-0.5">
          {members.map((m) => (
            <div key={m.name} className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/[0.03] transition-colors">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-accent-peach/20 to-accent-rose/20 flex items-center justify-center text-[9px] font-bold text-txt-secondary flex-shrink-0">
                {m.name[0]}
              </div>
              <span className="text-[12px] text-txt-secondary flex-1 truncate">{m.name}</span>
              <div className="w-2 h-2 rounded-full" style={{ background: m.color }} />
            </div>
          ))}
        </div>
      )}

      {activeMode === 'compact' && (
        <div className="p-2">
          <div className="flex flex-wrap gap-1">
            {members.map((m) => (
              <div key={m.name} className="relative group">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-peach/20 to-accent-rose/20 border border-white/[0.08] flex items-center justify-center text-[9px] font-bold text-txt-secondary">
                  {m.name[0]}
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-surface-base" style={{ background: m.color }} />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded-md bg-[#1a1a23] border border-white/[0.08] text-[10px] text-txt-secondary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  {m.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Theme preview card ──────────────────────────────────────────────────────

const THEMES_PREVIEW = [
  { name: 'Midnight', gradient: 'from-[#1a1a2e] to-[#16213e]', accent: '#c4b5fd', labelKey: 'midnight_desc' },
  { name: 'Crimson', gradient: 'from-[#2d1a1a] to-[#1a0a0a]', accent: '#fda4af', labelKey: 'crimson_desc' },
  { name: 'Aurora', gradient: 'from-[#0f2027] to-[#203a43]', accent: '#86efac', labelKey: 'aurora_desc' },
  { name: 'Nebula', gradient: 'from-[#1a0a2e] to-[#2d1b4e]', accent: '#7dd3fc', labelKey: 'nebula_desc' },
  { name: 'Obsidian', gradient: 'from-[#0a0a0a] to-[#1a1a1a]', accent: '#e5e5e5', labelKey: 'obsidian_desc' },
  { name: 'Carbon', gradient: 'from-[#1c1c1c] to-[#2d2d2d]', accent: '#9ca3af', labelKey: 'carbon_desc' },
  { name: 'Cyber', gradient: 'from-[#0a0a1a] to-[#001a1a]', accent: '#00ffd5', labelKey: 'cyber_desc' },
  { name: 'Vertex', gradient: 'from-[#13131a] to-[#1a1a23]', accent: '#82efac', labelKey: 'vertex_desc' },
];

function ThemeCard({ name, gradient, accent, labelKey }: { name: string; gradient: string; accent: string; labelKey: string }) {
  const labels: Record<string, string> = {
    midnight_desc: 'Deep purple-navy',
    crimson_desc: 'Rich dark red',
    aurora_desc: 'Teal-green glow',
    nebula_desc: 'Cosmic purple-blue',
    obsidian_desc: 'Pure black elegance',
    carbon_desc: 'Sleek graphite finish',
    cyber_desc: 'Neon cyberpunk aesthetic',
    vertex_desc: 'Signature VERTEX look',
  };

  return (
    <div className="group relative flex flex-col rounded-2xl border border-white/[0.07] overflow-hidden bg-white/[0.02] transition-all duration-300 hover:border-white/[0.12] hover:-translate-y-1">
      <div className={`h-24 bg-gradient-to-br ${gradient} relative`}>
        <div
          className="absolute inset-0 opacity-40"
          style={{ background: `radial-gradient(circle at 30% 50%, ${accent}80, transparent 60%)` }}
        />
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-md border border-white/20 bg-white/10 flex items-center justify-center backdrop-blur-sm">
              <span className="text-[8px] font-bold" style={{ color: accent }}>V</span>
            </div>
            <div className="space-y-1">
              <div className="h-1.5 w-12 rounded bg-white/20" />
              <div className="h-1 w-8 rounded bg-white/10" />
            </div>
          </div>
          <div
            className="w-4 h-4 rounded-full border border-white/20"
            style={{ background: accent, boxShadow: `0 0 8px ${accent}80` }}
          />
        </div>
        {/* Subtle animated shimmer for premium themes */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
      </div>
      <div className="p-3">
        <div className="text-[12px] font-bold text-txt-primary">{name}</div>
        <div className="text-[10px] text-txt-tertiary mt-0.5">{labels[labelKey]}</div>
      </div>
    </div>
  );
}

// ─── Premium Profile preview ─────────────────────────────────────────────────

function PremiumProfilePreview({ t }: { t: (key: string) => string }) {
  void t; // labels are illustrative; keys reserved for future i18n
  return (
    <div className="relative rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
      {/* Animated banner mockup */}
      <div className="h-28 bg-gradient-to-r from-accent-peach/20 via-accent-rose/20 to-accent-lavender/20 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_100%,rgba(252,165,165,0.3),transparent_70%)]" />
        {/* Animated gradient wave */}
        <div className="absolute inset-0 opacity-40">
          <div className="absolute bottom-0 left-0 right-0 h-8">
            <svg viewBox="0 0 400 32" className="w-full h-full" preserveAspectRatio="none">
              <path d="M0,16 Q100,0 200,16 T400,16" fill="none" stroke="rgba(252,165,165,0.4)" strokeWidth="2">
                <animate attributeName="d" dur="3s" repeatCount="indefinite" values="M0,16 Q100,0 200,16 T400,16;M0,20 Q100,32 200,20 T400,20;M0,16 Q100,0 200,16 T400,16" />
              </path>
              <path d="M0,24 Q100,8 200,24 T400,24" fill="none" stroke="rgba(196,181,253,0.3)" strokeWidth="1.5">
                <animate attributeName="d" dur="4s" repeatCount="indefinite" values="M0,24 Q100,8 200,24 T400,24;M0,20 Q100,36 200,20 T400,24;M0,24 Q100,8 200,24 T400,24" />
              </path>
            </svg>
          </div>
        </div>
        <div className="absolute top-3 right-3 px-2.5 py-1 rounded-md bg-accent-peach/25 border border-accent-peach/40 text-[9px] font-bold text-accent-peach tracking-wide backdrop-blur-sm">
          ✦ NETREX
        </div>
      </div>
      {/* Avatar + info */}
      <div className="px-5 pb-5 -mt-10">
        <div className="relative inline-block">
          <div className="w-18 h-18 rounded-full bg-gradient-to-br from-accent-peach/40 to-accent-rose/30 border-4 border-surface-chat flex items-center justify-center text-[28px] font-black text-txt-primary shadow-[0_8px_32px_-8px_rgba(252,165,165,0.3)]">
            A
          </div>
          {/* Netrex badge ring */}
          <div className="absolute -inset-1 rounded-full border-2 border-accent-peach/30 shadow-[0_0_12px_rgba(252,165,165,0.2)]" />
          <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-accent-peach border-2 border-surface-chat flex items-center justify-center shadow-[0_2px_8px_rgba(252,165,165,0.4)]">
            <span className="text-[10px]">✦</span>
          </div>
          {/* Status indicator */}
          <div className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-accent-mint border-2 border-surface-chat" />
        </div>
        <div className="mt-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[16px] font-bold text-txt-primary">Alex</span>
            <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-accent-peach/20 text-accent-peach border border-accent-peach/30">✦ NETREX</span>
          </div>
          <div className="text-[11px] text-txt-tertiary mt-0.5">@alex · Premium Member</div>
        </div>
        {/* Effect decorations */}
        <div className="mt-4 flex flex-wrap gap-2">
          <div className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[10px] text-txt-secondary flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-gradient-to-br from-accent-peach to-accent-rose" /> Custom Accent
          </div>
          <div className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[10px] text-txt-secondary flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-gradient-to-br from-accent-lavender to-accent-sky" /> Animated Badge
          </div>
          <div className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[10px] text-txt-secondary flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-gradient-to-br from-accent-mint to-accent-peach" /> Profile Glow
          </div>
        </div>
        {/* Bio */}
        <div className="mt-4 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
          <p className="text-[11.5px] text-txt-secondary leading-relaxed">
            Building the future of federated communication. ✦
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Streaming quality grid ─────────────────────────────────────────────────

const STREAM_QUALITIES = [
  { label: '1080p', fps: '60 FPS', available: true, note: null as string | null },
  { label: '1440p', fps: '60 FPS', available: true, note: null as string | null },
  { label: '4K', fps: 'Up to 30 FPS', available: true, note: 'when available' },
  { label: '8K', fps: 'Coming soon', available: false, note: 'future' },
];

function StreamingQualityGrid() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {STREAM_QUALITIES.map((q) => (
        <div
          key={q.label}
          className={`relative flex flex-col rounded-xl border p-4 transition-all duration-300 ${
            q.available
              ? 'border-white/[0.07] bg-white/[0.02] hover:border-accent-peach/20 hover:bg-accent-peach/5'
              : 'border-white/[0.04] bg-white/[0.01] opacity-50'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[16px] font-bold tracking-tight ${q.available ? 'text-txt-primary' : 'text-txt-tertiary'}`}>
              {q.label}
            </span>
            {q.note && (
              <span className="text-[9px] font-semibold text-txt-tertiary px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]">{q.note}</span>
            )}
          </div>
          <span className={`text-[11px] ${q.available ? 'text-txt-secondary' : 'text-txt-tertiary'}`}>{q.fps}</span>
          {q.available && (
            <div className="mt-3 flex flex-wrap gap-1">
              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-accent-peach/10 text-accent-peach border border-accent-peach/20">VP9</span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-white/5 text-txt-tertiary border border-white/[0.06]">H.264</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function NetrexSection() {
  const { t } = useLanguage();
  // Both purchase buttons (hero + pricing footer) open the shared modal.
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  return (
    <div className="relative flex-1 h-full w-full min-w-0 min-h-0 bg-surface-chat overflow-y-auto">
      {/* Animated aura background */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden" style={{ zIndex: 0 }}>
        <div className="netrex-aura-orb netrex-aura-1" />
        <div className="netrex-aura-orb netrex-aura-2" />
        <div className="netrex-aura-orb netrex-aura-3" />
        <div className="absolute inset-0 opacity-[0.015]" style={{
          backgroundImage: 'linear-gradient(rgba(252,165,165,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(252,165,165,0.5) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }} />
      </div>

      {/* Content */}
      <div className="relative w-full max-w-[960px] mx-auto px-8 md:px-12 py-14 md:py-20" style={{ zIndex: 1 }}>

        {/* ── Hub: single status header + features + purchase modal ── */}
        <NetrexBridge />

        {/* ── Hero ── */}
        <header className="text-center mb-20 md:mb-28">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl border border-accent-peach/25 bg-accent-peach/10 mb-8">
            <span className="text-[26px] text-accent-peach" style={{ textShadow: '0 0 24px rgba(252,165,165,0.5)' }}>✦</span>
          </div>

          <h1 className="text-[52px] md:text-[72px] font-bold tracking-[-0.04em] leading-[0.95] text-txt-primary">
            NET<span className="text-accent-peach" style={{ textShadow: '0 0 40px rgba(252,165,165,0.35)' }}>REX</span>
          </h1>

          <p className="mt-5 text-[18px] md:text-[20px] font-semibold tracking-[-0.01em] text-accent-peach/80">
            {t('netrex_tagline')}
          </p>

          <p className="mt-5 text-[15px] leading-relaxed text-txt-secondary max-w-[48ch] mx-auto">
            {t('netrex_hero_desc')}
          </p>

          <button
            type="button"
            onClick={() => setPurchaseOpen(true)}
            className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-full border border-accent-peach/25 bg-accent-peach/10 text-[13px] font-semibold text-accent-peach cursor-pointer transition-all duration-200 hover:bg-accent-peach/15 hover:border-accent-peach/35 hover:shadow-[0_0_24px_rgba(252,165,165,0.15)]"
          >
            {t('netrex_purchase_button_price')}
          </button>
        </header>

        {/* ── Features grid ── */}
        <section className="mb-20 md:mb-28">
          <SectionLabel>{t('netrex_all_includes')}</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard icon={<PaletteIcon />} title={t('netrex_personalization')} description={t('netrex_personalization_desc')} accent="rgb(196,181,253)" />
            <FeatureCard icon={<UserIcon />} title={t('netrex_profiles')} description={t('netrex_profiles_desc')} accent="rgb(252,165,165)" />
            <FeatureCard icon={<ServerIcon />} title={t('netrex_vertserver')} description={t('netrex_vertserver_desc')} accent="rgb(125,211,252)" />
            <FeatureCard icon={<ActivityIcon />} title={t('netrex_activity')} description={t('netrex_activity_desc')} accent="rgb(134,239,172)" />
            <FeatureCard icon={<StreamingIcon />} title={t('netrex_streaming')} description={t('netrex_streaming_desc')} accent="rgb(252,211,77)" />
            <FeatureCard icon={<SparkleIcon />} title={t('netrex_experience')} description={t('netrex_experience_desc')} accent="rgb(251,146,60)" />
            <FeatureCard icon={<SparkleFillIcon />} title={t('netrex_feature_effects')} description={t('netrex_feature_effects_desc')} accent="rgb(196,181,253)" />
            <FeatureCard icon={<BadgeIcon />} title={t('netrex_feature_custom_identity')} description={t('netrex_feature_custom_identity_desc')} accent="rgb(252,165,165)" />
            <FeatureCard icon={<ThemeIcon />} title={t('netrex_feature_backgrounds')} description={t('netrex_feature_backgrounds_desc')} accent="rgb(125,211,252)" />
            <FeatureCard icon={<CosmeticsIcon />} title={t('netrex_feature_badge')} description={t('netrex_feature_badge_desc')} accent="rgb(251,146,60)" />
            <FeatureCard icon={<SparkleIcon />} title={t('netrex_feature_profile_themes')} description={t('netrex_feature_profile_themes_desc')} accent="rgb(134,239,172)" />
            <FeatureCard icon={<PresenceIcon />} title={t('netrex_feature_presence')} description={t('netrex_feature_presence_desc')} accent="rgb(252,211,77)" />
          </div>
        </section>

        {/* ── Personalization Landing ── */}
        <section className="mb-20 md:mb-28">
          <PersonalizationLanding />
        </section>

        {/* ── VERTSERVER ── */}
        <section className="mb-20 md:mb-28">
          <SectionLabel>{t('netrex_vertserver')}</SectionLabel>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <div>
              <h2 className="text-[32px] md:text-[36px] font-bold tracking-[-0.03em] text-txt-primary leading-tight">
                {t('netrex_vertserver_title')}
              </h2>
              <p className="mt-4 text-[14px] leading-relaxed text-txt-secondary">
                {t('netrex_vertserver_desc_long')}
              </p>

              {/* Identity */}
              <div className="mt-8">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent-peach">✦</span>
                  <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-txt-tertiary">{t('netrex_vertserver_identity')}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {[
                    t('netrex_vertserver_feature_custom_icon'),
                    t('netrex_vertserver_feature_custom_banner'),
                    t('netrex_vertserver_feature_animated_banner_server'),
                    t('netrex_vertserver_feature_description'),
                    t('netrex_vertserver_feature_accent_color'),
                  ].map((f) => (
                    <div key={f} className="flex items-center gap-3 text-[12px] text-txt-secondary">
                      <span className="w-1 h-1 rounded-full bg-accent-peach/60 flex-shrink-0" />
                      {f}
                    </div>
                  ))}
                </div>
              </div>

              {/* Appearance */}
              <div className="mt-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent-lavender">✦</span>
                  <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-txt-tertiary">{t('netrex_vertserver_appearance')}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {[
                    t('netrex_vertserver_feature_server_themes'),
                    t('netrex_vertserver_feature_custom_backgrounds'),
                    t('netrex_vertserver_feature_gradients'),
                    t('netrex_vertserver_feature_visual_effects'),
                    t('netrex_vertserver_feature_channel_appearance'),
                  ].map((f) => (
                    <div key={f} className="flex items-center gap-3 text-[12px] text-txt-secondary">
                      <span className="w-1 h-1 rounded-full bg-accent-lavender/60 flex-shrink-0" />
                      {f}
                    </div>
                  ))}
                </div>
              </div>

              {/* Community */}
              <div className="mt-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent-mint">✦</span>
                  <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-txt-tertiary">{t('netrex_vertserver_community')}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {[
                    t('netrex_vertserver_feature_member_panel_layouts'),
                    t('netrex_vertserver_feature_realtime_activity'),
                    t('netrex_vertserver_feature_stats'),
                    t('netrex_vertserver_feature_widgets'),
                    t('netrex_vertserver_feature_member_list'),
                  ].map((f) => (
                    <div key={f} className="flex items-center gap-3 text-[12px] text-txt-secondary">
                      <span className="w-1 h-1 rounded-full bg-accent-mint/60 flex-shrink-0" />
                      {f}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <VertservPreview />
          </div>
        </section>

        {/* ── Activity Member Panel ── */}
        <section className="mb-20 md:mb-28">
          <SectionLabel>{t('netrex_activity_panel_title')}</SectionLabel>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <div>
              <h2 className="text-[32px] md:text-[36px] font-bold tracking-[-0.03em] text-txt-primary leading-tight">
                {t('netrex_activity_panel_title')}
              </h2>
              <p className="mt-4 text-[14px] leading-relaxed text-txt-secondary">
                {t('netrex_activity_panel_desc')}
              </p>
              <p className="mt-4 text-[12px] text-txt-tertiary">
                {t('netrex_activity_layouts_hint')}
              </p>
            </div>
            <ActivityPanelPreview t={t} />
          </div>
        </section>

        {/* ── Themes ── */}
        <section className="mb-20 md:mb-28">
          <SectionLabel>{t('netrex_themes_title')}</SectionLabel>
          <h2 className="text-[32px] md:text-[36px] font-bold tracking-[-0.03em] text-txt-primary mb-2">
            {t('netrex_themes_title')}
          </h2>
          <p className="text-[13px] text-txt-tertiary mb-8">{t('netrex_themes_note')}</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {THEMES_PREVIEW.map((theme) => (
              <ThemeCard key={theme.name} {...theme} />
            ))}
          </div>
        </section>

        {/* ── Premium Profile ── */}
        <section className="mb-20 md:mb-28">
          <SectionLabel>{t('netrex_profile_title')}</SectionLabel>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <div>
              <h2 className="text-[32px] md:text-[36px] font-bold tracking-[-0.03em] text-txt-primary leading-tight">
                {t('netrex_profile_title')}
              </h2>
              <p className="mt-4 text-[14px] leading-relaxed text-txt-secondary">
                {t('netrex_profile_desc')}
              </p>
              <div className="mt-6 flex flex-col gap-2">
                {[
                  t('netrex_profile_feature_avatar_effects'),
                  t('netrex_profile_feature_banner'),
                  t('netrex_profile_feature_frame'),
                  t('netrex_profile_feature_glow'),
                  t('netrex_profile_feature_accent'),
                  t('netrex_profile_feature_badge'),
                  t('netrex_profile_feature_status_effects'),
                ].map((f) => (
                  <div key={f} className="flex items-center gap-3 text-[12px] text-txt-secondary">
                    <span className="text-accent-peach/60 text-[10px]">◈</span>
                    {f}
                  </div>
                ))}
              </div>
            </div>
            <PremiumProfilePreview t={t} />
          </div>
        </section>

        {/* ── Streaming ── */}
        <section className="mb-20 md:mb-28">
          <SectionLabel>{t('netrex_streaming_title')}</SectionLabel>
          <h2 className="text-[32px] md:text-[36px] font-bold tracking-[-0.03em] text-txt-primary mb-2">
            {t('netrex_streaming_title')}
          </h2>
          <p className="text-[13px] text-txt-tertiary mb-8">{t('netrex_streaming_note')}</p>
          <StreamingQualityGrid />
        </section>

        {/* ── Music box styles — the showcase: every style animated, applying
            gated by Netrex. Sits AFTER the feature sections as the closing
            sales window (8 data-driven card variants). ── */}
        <MusicStylePicker />

        {/* ── Pricing ── */}
        <section className="flex flex-col items-center text-center pt-8 pb-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl border border-accent-peach/20 bg-accent-peach/10 mb-6">
            <span className="text-[22px] text-accent-peach" style={{ textShadow: '0 0 20px rgba(252,165,165,0.5)' }}>✦</span>
          </div>
          <h2 className="text-[28px] md:text-[32px] font-bold tracking-[-0.03em] text-txt-primary">
            NETREX
          </h2>
          <div className="mt-3 text-[40px] md:text-[52px] font-bold tracking-[-0.04em] text-accent-peach" style={{ textShadow: '0 0 40px rgba(252,165,165,0.35)' }}>
            {t('netrex_price')}
          </div>
          <p className="mt-2 text-[13px] text-txt-tertiary">{t('netrex_once_label')}</p>
          <button
            type="button"
            onClick={() => setPurchaseOpen(true)}
            className="mt-8 inline-flex items-center gap-2 px-8 py-3.5 rounded-xl border border-accent-peach/25 bg-accent-peach/10 text-[14px] font-semibold text-accent-peach cursor-pointer transition-all duration-200 hover:bg-accent-peach/15 hover:border-accent-peach/35 hover:shadow-[0_0_28px_rgba(252,165,165,0.2)]"
          >
            {t('netrex_purchase_button_price')}
          </button>
        </section>

        {/* ── Footer ── */}
        <footer className="mt-16 border-t border-white/[0.06] pt-6 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-txt-tertiary/80">NETREX · Premium de VERTEX</span>
          <span className="text-[11px] text-txt-tertiary/50 tabular-nums">© {new Date().getFullYear()} Vertex</span>
        </footer>
      </div>

      {/* Shared purchase modal — hero + pricing buttons both land here. */}
      {purchaseOpen && (
        <NetrexPurchaseModal
          isOpen={purchaseOpen}
          onClose={() => setPurchaseOpen(false)}
        />
      )}
    </div>
  );
}

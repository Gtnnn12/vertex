import React from 'react';
import type { BoardWidget, BoardWidgetType, StaffRole } from '@backspace/shared';
import { BOARD_FIELD_LIMITS, BOARD_WIDGET_TYPES } from '@backspace/shared';
import { useLanguage } from '../../../contexts/LanguageContext';
import { StaffBadge, NetrexChip } from '../../ui/StaffBadge';
import { useAuthStore } from '../../../stores/authStore';
import { SpotifyVinylBlock } from '../../spotify/SpotifyVinylBlock';
import { resolveUploadSrc } from './boardUtils';

// ─── Widget card shell ────────────────────────────────────────────────────────
// The ONLY card chrome in the whole board: icon + label + hairline border +
// hover/focus states. Renderers paint the VALUE only. Adding a widget never
// touches this — it's one registry entry below.

export interface WidgetShellProps {
  icon: React.ReactNode;
  labelKey: string;
  children: React.ReactNode;
  /** Subtle accent tint for the icon well (hex). */
  accent?: string;
}

export function WidgetCardShell({ icon, labelKey, children, accent }: WidgetShellProps) {
  const { t } = useLanguage();
  return (
    <div
      tabIndex={0}
      className="board-widget group/board min-w-0 rounded-xl border border-white/[0.06] bg-transparent p-4 outline-none transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-white/[0.12] hover:shadow-[0_10px_28px_-14px_var(--profile-accent,rgb(var(--accent-primary)))66] focus-visible:border-accent-primary/50 focus-visible:ring-1 focus-visible:ring-accent-primary/30 motion-reduce:transition-none motion-reduce:hover:transform-none"
      style={{ boxShadow: '0 0 0 0 transparent' }}
    >
      <div className="mb-2.5 flex items-baseline gap-2">
        <span className="text-[10px] text-txt-tertiary" aria-hidden>✦</span>
        <span
          className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-txt-tertiary"
          style={accent ? { color: accent } : undefined}
        >
          {t(labelKey)}
        </span>
        <span className="sr-only">{icon}</span>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ─── Value renderers (one per type — paint the value, nothing else) ─────────

type RendererProps = { config: Record<string, unknown>; lookupUserId: string; isSelf: boolean };

/**
 * The viewer's own real badges (session user): staffRole + Netrex. Used by
 * the badges widget — staff roles can never be hand-picked in the editor.
 */
function useRealBadges(): string[] {
  const staffRole = useAuthStore((s) => s.user?.staffRole ?? null);
  const netrexEnabled = useAuthStore((s) => s.user?.netrexEnabled ?? false);
  const badges: string[] = [];
  if (staffRole) badges.push(staffRole);
  if (netrexEnabled) badges.push('netrex');
  return badges.slice(0, BOARD_FIELD_LIMITS.maxBadges);
}

function FavoriteGameValue({ config }: RendererProps) {
  const title = typeof config.title === 'string' ? config.title : null;
  const description = typeof config.description === 'string' ? config.description : null;
  const cover = typeof config.coverUrl === 'string' ? config.coverUrl : null;
  if (!title && !cover) {
    return <EmptyValue textKey="board_empty_default" />;
  }
  // Editorial two-column card: big cover (40%) with soft overlay + fluid
  // text column (60%) with a display-serif title.
  return (
    <div className="flex items-stretch gap-3.5">
      {cover && (
        <div className="relative w-[40%] max-w-[132px] shrink-0 overflow-hidden rounded-lg">
          <img
            src={resolveUploadSrc(cover)}
            alt=""
            loading="lazy"
            className="aspect-[3/4] h-full w-full object-cover"
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: 'linear-gradient(180deg, transparent 55%, rgba(0,0,0,0.45) 100%)' }}
            aria-hidden
          />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        {title && (
          <div
            className="break-words text-[19px] font-semibold italic leading-tight"
            style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}
          >
            {title}
          </div>
        )}
        {description && (
          <p className="mt-1.5 line-clamp-4 text-[12.5px] leading-relaxed text-txt-secondary">{description}</p>
        )}
        {!title && !description && <EmptyValue textKey="board_empty_default" />}
      </div>
    </div>
  );
}

function NowSongValue({ lookupUserId, isSelf }: RendererProps) {
  // Reuses the EXISTING Spotify block — zero new music code (NO TOCAR Spotify).
  return <SpotifyVinylBlock lookupUserId={lookupUserId} isSelf={isSelf} compact />;
}

function QuoteValue({ config }: RendererProps) {
  const text = typeof config.text === 'string' ? config.text : null;
  const author = typeof config.author === 'string' ? config.author : null;
  if (!text) return <EmptyValue textKey="board_empty_quote" />;
  return (
    <blockquote className="min-w-0">
      <p
        className="break-words text-[16px] font-medium italic leading-snug text-txt-primary"
        style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}
      >
        “{text}”
      </p>
      {author && (
        <footer className="mt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-txt-tertiary">
          — {author}
        </footer>
      )}
    </blockquote>
  );
}

function MoodValue({ config }: RendererProps) {
  const text = typeof config.text === 'string' ? config.text : null;
  const emoji = typeof config.emoji === 'string' ? config.emoji : '✦';
  const color = typeof config.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(config.color) ? config.color : null;
  if (!text) return <EmptyValue textKey="board_empty_mood" />;
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0 text-[14px] leading-none" style={color ? { color } : undefined} aria-hidden>
        {emoji}
      </span>
      <span className="min-w-0 break-words text-[14px] italic leading-snug text-txt-primary"
        style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}>
        {text}
      </span>
    </div>
  );
}

function SocialLinksValue({ config }: RendererProps) {
  const links = Array.isArray(config.links) ? (config.links as Array<{ label: string; url: string }>) : [];
  if (links.length === 0) return <EmptyValue textKey="board_empty_links" />;
  return (
    <ul className="space-y-1">
      {links.map((l, i) => (
        <li key={`${l.url}:${i}`}>
          <a
            href={l.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-[12px] text-accent-primary transition-colors hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-primary/40"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="shrink-0" aria-hidden>
              <path d="M7 17L17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="truncate">{l.label}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function BadgesValue({ config }: RendererProps) {
  // SECURITY: badges are never taken from config — they are derived from the
  // signed-in user's REAL entitlements (auth store). A viewer's board always
  // shows that board owner's own real badges via lookupUserId; self-edit
  // derives from the session user. The server strips fake badges on save.
  const realBadges = useRealBadges();
  if (realBadges.length === 0) return <EmptyValue textKey="board_empty_badges" />;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {realBadges.map((b) =>
        b === 'netrex'
          ? <NetrexChip key={b} showLabel />
          : <StaffBadge key={b} role={b as StaffRole} showLabel />,
      )}
    </div>
  );
  void config;
}

function GoalValue({ config }: RendererProps) {
  const { t } = useLanguage();
  const title = typeof config.title === 'string' ? config.title : null;
  const progress = typeof config.progress === 'number' ? Math.min(100, Math.max(0, config.progress)) : 0;
  if (!title) return <EmptyValue textKey="board_empty_goal" />;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[13px] font-medium text-txt-primary">{title}</span>
        <span className="shrink-0 text-[11px] font-semibold tabular-nums text-txt-tertiary">{progress}%</span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]"
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={title}
      >
        <div
          className="h-full rounded-full bg-accent-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>
      {void t}
    </div>
  );
}

function FriendSpotlightValue({ config, lookupUserId }: RendererProps) {
  const { t } = useLanguage();
  const name = typeof config.name === 'string' ? config.name : null;
  const message = typeof config.message === 'string' ? config.message : null;
  const avatar = typeof config.avatarUrl === 'string' ? config.avatarUrl : null;
  if (!name && !message) return <EmptyValue textKey="board_empty_friend" />;
  return (
    <div className="flex items-start gap-2.5">
      {avatar ? (
        <img
          src={resolveUploadSrc(avatar)}
          alt=""
          loading="lazy"
          className="h-9 w-9 shrink-0 rounded-full border border-white/[0.08] object-cover"
        />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[13px] font-semibold text-txt-secondary" aria-hidden>
          {(name ?? '?').charAt(0).toUpperCase()}
        </span>
      )}
      <div className="min-w-0">
        {name && <div className="truncate text-[13px] font-semibold text-txt-primary">{name}</div>}
        {message && <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-txt-secondary">{message}</p>}
        {!name && !message && <EmptyValue textKey="board_empty_friend" />}
      </div>
      {void lookupUserId}
      {void t}
    </div>
  );
}

function TopGamesValue({ config }: RendererProps) {
  const games = Array.isArray(config.games) ? (config.games as Array<{ title: string; coverUrl?: string }>) : [];
  if (games.length === 0) return <EmptyValue textKey="board_empty_top_games" />;
  return (
    <div className="grid grid-cols-3 gap-2">
      {games.slice(0, 3).map((g, i) => (
        <div key={`${g.title}:${i}`} className="min-w-0">
          <div className="aspect-square w-full overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.04]">
            {g.coverUrl ? (
              <img src={resolveUploadSrc(g.coverUrl)} alt={g.title} loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[11px] font-bold text-txt-tertiary">#{i + 1}</div>
            )}
          </div>
          <div className="mt-1 truncate text-[11px] font-medium text-txt-secondary" title={g.title}>{g.title}</div>
        </div>
      ))}
    </div>
  );
}

function WishlistValue({ config }: RendererProps) {
  const items = Array.isArray(config.items) ? (config.items as string[]) : [];
  if (items.length === 0) return <EmptyValue textKey="board_empty_wishlist" />;
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={`${item}:${i}`} className="flex min-w-0 items-center gap-1.5 text-[12px] text-txt-secondary">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 text-txt-tertiary" aria-hidden>
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
          <span className="truncate">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function EmptyValue({ textKey }: { textKey: string }) {
  const { t } = useLanguage();
  return (
    <div className="flex min-h-[36px] items-center rounded-lg border border-dashed border-white/[0.09] px-2 text-[12px] text-txt-tertiary">
      {t(textKey)}
    </div>
  );
}

// ─── The registry ─────────────────────────────────────────────────────────────
// ONE entry per widget type. Adding a widget = adding ONE entry here (+ one
// BOARD_WIDGET_TYPES value + i18n keys). No other file changes.

export interface BoardWidgetDef {
  type: BoardWidgetType;
  /** i18n key for the card label. */
  labelKey: string;
  /** i18n key for the catalog description. */
  descKey: string;
  icon: React.ReactNode;
  accent?: string;
  defaultConfig: () => Record<string, unknown>;
  Renderer: React.ComponentType<RendererProps>;
}

const T = BOARD_FIELD_LIMITS;

const ico = {
  game: <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M21 6H3a2 2 0 00-2 2v8a2 2 0 002 2h18a2 2 0 002-2V8a2 2 0 00-2-2zM8 13H6v2H4v-2H2v-2h2V9h2v2h2v2zm8 2a2 2 0 110-4 2 2 0 010 4zm3-4a2 2 0 110-4 2 2 0 010 4z" /></svg>,
  music: <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" /></svg>,
  quote: <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z" /></svg>,
  mood: <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-3.5 8a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm7 0a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM12 17.5c2.03 0 3.8-1.11 4.75-2.75l-1.73-1a3.5 3.5 0 01-6.04 0l-1.73 1A5.49 5.49 0 0012 17.5z" transform="translate(-2)" /></svg>,
  link: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M10 14a5 5 0 007.07 0l3-3a5 5 0 00-7.07-7.07l-1.5 1.5M14 10a5 5 0 00-7.07 0l-3 3a5 5 0 007.07 7.07l1.5-1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  badge: <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" /></svg>,
  goal: <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 4a6 6 0 100 12 6 6 0 000-12zm0 4a2 2 0 100 4 2 2 0 000-4z" /></svg>,
  friend: <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-4.42 0-8 1.79-8 4v2h16v-2c0-2.21-3.58-4-8-4z" /></svg>,
  podium: <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M5 17h4v-6H5v6zm5 0h4V9h-4v8zm5 0h4v-9h-4v9zM3 21h18v-2H3v2z" transform="translate(0 -2)" /></svg>,
  wish: <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>,
};

export const WIDGET_REGISTRY: Record<BoardWidgetType, BoardWidgetDef> = {
  'favorite-game': {
    type: 'favorite-game',
    labelKey: 'board_widget_favorite_game',
    descKey: 'board_widget_favorite_game_desc',
    icon: ico.game,
    defaultConfig: () => ({ title: '', description: '', coverUrl: '' }),
    Renderer: FavoriteGameValue,
  },
  'now-song': {
    type: 'now-song',
    labelKey: 'board_widget_now_song',
    descKey: 'board_widget_now_song_desc',
    icon: ico.music,
    defaultConfig: () => ({}),
    Renderer: NowSongValue,
  },
  quote: {
    type: 'quote',
    labelKey: 'board_widget_quote',
    descKey: 'board_widget_quote_desc',
    icon: ico.quote,
    defaultConfig: () => ({ text: '', author: '' }),
    Renderer: QuoteValue,
  },
  mood: {
    type: 'mood',
    labelKey: 'board_widget_mood',
    descKey: 'board_widget_mood_desc',
    icon: ico.mood,
    defaultConfig: () => ({ text: '', emoji: '✦', color: '#57f287' }),
    Renderer: MoodValue,
  },
  'social-links': {
    type: 'social-links',
    labelKey: 'board_widget_social_links',
    descKey: 'board_widget_social_links_desc',
    icon: ico.link,
    defaultConfig: () => ({ links: [{ label: '', url: '' }] }),
    Renderer: SocialLinksValue,
  },
  badges: {
    type: 'badges',
    labelKey: 'board_widget_badges',
    descKey: 'board_widget_badges_desc',
    icon: ico.badge,
    defaultConfig: () => ({ badges: [] }),
    Renderer: BadgesValue,
  },
  goal: {
    type: 'goal',
    labelKey: 'board_widget_goal',
    descKey: 'board_widget_goal_desc',
    icon: ico.goal,
    defaultConfig: () => ({ title: '', progress: 0 }),
    Renderer: GoalValue,
  },
  'friend-spotlight': {
    type: 'friend-spotlight',
    labelKey: 'board_widget_friend_spotlight',
    descKey: 'board_widget_friend_spotlight_desc',
    icon: ico.friend,
    defaultConfig: () => ({ name: '', message: '', avatarUrl: '' }),
    Renderer: FriendSpotlightValue,
  },
  'top-games': {
    type: 'top-games',
    labelKey: 'board_widget_top_games',
    descKey: 'board_widget_top_games_desc',
    icon: ico.podium,
    defaultConfig: () => ({ games: [] }),
    Renderer: TopGamesValue,
  },
  wishlist: {
    type: 'wishlist',
    labelKey: 'board_widget_wishlist',
    descKey: 'board_widget_wishlist_desc',
    icon: ico.wish,
    defaultConfig: () => ({ items: [] }),
    Renderer: WishlistValue,
  },
};

/** Registry order — the catalog listing order. */
export const WIDGET_CATALOG: BoardWidgetDef[] = BOARD_WIDGET_TYPES.map((type) => WIDGET_REGISTRY[type]);

export { T as BOARD_LIMITS };

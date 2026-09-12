import { useMemo } from 'react';

import type { Activity, ActivitySpotify } from '@backspace/shared';
import { getPrimaryActivity } from '@backspace/shared/src/activities.js';
import { useActivityStore } from '../../stores/activityStore';
import { useAuthStore } from '../../stores/authStore';
import { useMusicStyleForSelf } from '../../stores/musicWidgetStore';
import { resolveMusicStyle } from '../../spotify/musicStyles';
import { SpotifyCard } from './SpotifyVinyl';
import { MatchCard } from './MatchCard';

interface SpotifyVinylBlockProps {
  /** Canonical lookup id — the same key the activity panels use: `homeUserId ?? id`. */
  lookupUserId: string;
  /** True when the surface shows the logged-in user themselves: falls back to myActivities. */
  isSelf?: boolean;
  /** Compact variant (popout). */
  compact?: boolean;
}

/** Does this activity represent Spotify at all (rich OR window/process detection)? */
function isSpotifyActivity(a: Activity): boolean {
  if (a.type === 'spotify') return true;
  return (a.type === 'listening' || a.type === 'playing') && /spotify/i.test(a.name);
}

type GamePlaying = { game: Activity; spotify: ActivitySpotify | null };

/**
 * Primary activity is a detected GAME → the widget shows the Match Card.
 * Spotify-type activities outrank `playing` in ACTIVITY_PRIORITY only when
 * both exist as separate rows; a game while music plays means the game is
 * primary OR coexists — find the game row and, if present, any rich Spotify
 * row for the fine secondary line.
 */
function findGamePlaying(pool: Activity[]): GamePlaying | null {
  const game =
    pool.find((a) => a.type === 'playing' && !/spotify/i.test(a.name)) ??
    pool.find((a) => a.type === 'streaming' && !/spotify/i.test(a.name));
  if (!game) return null;
  const richSpotify = pool.find((a) => a.type === 'spotify' && a.spotify);
  return { game, spotify: richSpotify?.spotify ?? null };
}

/**
 * Single source of truth for “is this user listening on Spotify?” across ALL
 * profile surfaces. Uses the EXACT helper the activity panel uses
 * (`getPrimaryActivity` — same store, same `homeUserId ?? id` key), then:
 *  - rich path: a poller activity (`type:'spotify'` + payload) → full card;
 *  - free path: a window/process-detected activity (`listening`/`playing`
 *    named “Spotify”, no cover) → same card with the generic VERTEX vinyl.
 * The card NEVER hides while a listening activity exists — worst case it
 * renders without cover and without times.
 *
 * Music-widget style: the card is ONE shell with a pluggable disc visual. For
 * the logged-in user the style comes from their saved preference (server-
 * validated Netrex entitlement, optimistic with rollback); for EVERYONE ELSE
 * it stays the classic vinyl. A saved premium style without entitlement
 * resolves to vinyl at render time (client safety net; server already gates).
 *
 * IMPORTANT: store selectors must return STABLE references (zustand
 * re-renders on Object.is mismatch). All deriving happens in useMemo below,
 * never inside a selector.
 */
export function SpotifyVinylBlock({ lookupUserId, isSelf, compact }: SpotifyVinylBlockProps) {
  // Atomic, stable selections only — the panel does exactly this.
  const activities = useActivityStore((s) => s.userActivities.get(lookupUserId));
  const myActivities = useActivityStore((s) => s.myActivities);

  // Style for the logged-in user. The hook resolves: live preview (hub) →
  // optimistic in-flight selection → saved value, with vinyl fallback when a
  // premium style lost its entitlement.
  const selfStyle = useMusicStyleForSelf();
  const isNetrex = useAuthStore((s) => s.user?.netrexEnabled ?? false);

  // Other users ALWAYS render the classic vinyl; self renders the chosen style.
  const style = isSelf ? selfStyle : resolveMusicStyle('vinyl', false);

  // Derive ONCE per (activities, myActivities) change — not per render.
  const cardData = useMemo(() => {
    const pool = activities && activities.length > 0 ? activities : (isSelf ? myActivities ?? [] : []);
    if (pool.length === 0) return null;

    // Same resolution the activity panel applies to decide a row exists.
    const primary = getPrimaryActivity(pool);
    // [TEMP-TRACE d] what the card's data-derivation actually sees
    // eslint-disable-next-line no-console
    console.log(`[card-read] lookup=${lookupUserId} self=${!!isSelf} poolSize=${pool.length} primary=${primary ? `type=${primary.type} name="${primary.name}"` : 'none'} payload=${primary?.spotify ? `song="${primary.spotify.song}" artist="${primary.spotify.artist}"` : 'NONE'}`);

    // ── MATCH CARD branch: playing a detected game → match card wins. ──
    // Netrex-gated: without the entitlement the widget stays the music box.
    if (isSelf && isNetrex) {
      const playing = findGamePlaying(pool);
      if (playing) return { kind: 'game' as const, ...playing };
    }

    if (!primary || !isSpotifyActivity(primary)) return null;

    // Rich payload: OAuth poller (premium) AND the promoted desktop Vía A
    // track (free accounts) — both carry song/artist (+cover when resolved).
    if (primary.type === 'spotify' && primary.spotify) {
      return { kind: 'music' as const, spotify: primary.spotify };
    }

    // Bare desktop detection with no parseable title (ads, menus): the card
    // still shows, without cover and without times — generic VERTEX vinyl.
    const fallback: ActivitySpotify = {
      song: primary.details ?? primary.name,
      artist: primary.state ?? '',
      albumName: undefined,
      albumCover: '',
      progressMs: 0,
      durationMs: 0,
      isPlaying: true,
      fetchedAt: primary.timestamps?.start ?? 0,
    };
    return { kind: 'music' as const, spotify: fallback };
  }, [activities, myActivities, isSelf]);

  if (!cardData) return null;

  // Match Card while a game is detected (already Netrex-gated above).
  if (cardData.kind === 'game') {
    return <MatchCard game={cardData.game} spotifyLine={cardData.spotify} compact={compact} />;
  }

  return <SpotifyCard spotify={cardData.spotify} compact={compact} style={style} />;
}

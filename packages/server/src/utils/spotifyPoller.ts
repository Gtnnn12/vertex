import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { spotifyTokens } from '../db/schema.js';
import { connectionManager } from '../ws/handler.js';
import type { Activity } from '@backspace/shared';

/**
 * Spotify "listening now" presence worker.
 *
 * Every 45s, for each user with stored tokens whose access token is valid
 * (refreshed transparently), poll Spotify's currently-playing endpoint and
 * project the result as a spotify-type activity through the existing
 * presence_update pipeline (same shape the client activity UI already
 * consumes).
 *
 * Grace period: when playback stops (paused/closed), the activity lingers for
 * 2 minutes before being cleared, so brief pauses don't flicker presence.
 */

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_NOW_PLAYING_URL = 'https://api.spotify.com/v1/me/player/currently-playing';
const POLL_INTERVAL_MS = 45_000;
const GRACE_PERIOD_MS = 2 * 60_000;

/** userId → last epoch ms playback was seen active. */
const lastActiveAt = new Map<string, number>();

/**
 * userIds whose now-playing poll answered HTTP 403 — free accounts. The
 * /currently-playing endpoint requires Premium, so that path will NEVER
 * succeed for them; the rich data arrives anyway through the desktop
 * window-title detector. Once flagged: no more requests, no more logs.
 * In-memory (not DB): a future Premium upgrade heals on server restart.
 */
const freeAccountPollingDisabled = new Set<string>();

/** Refresh an expired access token with the stored refresh token. */
async function refreshAccessToken(userId: string, refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
} | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[spotify-poller] refresh failed for ${userId.slice(0, 6)}***:`, res.status, text.slice(0, 150));
      // 400/401 usually means revoked token → drop the connection.
      if (res.status === 400 || res.status === 401) {
        getDb().delete(spotifyTokens).where(eq(spotifyTokens.userId, userId)).run();
        console.warn(`[spotify-poller] dropped revoked tokens for ${userId.slice(0, 6)}***`);
      }
      return null;
    }
    const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
    const tokens = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? refreshToken,
      expiresAt: Date.now() + (json.expires_in - 60) * 1000,
    };
    getDb()
      .update(spotifyTokens)
      .set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      })
      .where(eq(spotifyTokens.userId, userId))
      .run();
    return tokens;
  } catch (err) {
    console.error(`[spotify-poller] refresh network error for ${userId.slice(0, 6)}***:`, err);
    return null;
  }
}

interface NowPlaying {
  song: string;
  artist: string;
  albumName?: string;
  albumCover: string;
  progressMs: number;
  durationMs: number;
  isPlaying: boolean;
}

async function fetchNowPlaying(accessToken: string): Promise<NowPlaying | null | 'idle' | 'forbidden'> {
  try {
    const res = await fetch(SPOTIFY_NOW_PLAYING_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    // 204 = nothing playing; 401 = token expired (caller refreshes);
    // 403 = free account — the endpoint requires Premium permanently.
    if (res.status === 204) return 'idle';
    if (res.status === 401) return null;
    if (res.status === 403) return 'forbidden';
    if (!res.ok) {
      console.warn('[spotify-poller] now-playing HTTP', res.status);
      return null;
    }
    const json = (await res.json()) as {
      is_playing: boolean;
      progress_ms?: number;
      item?: {
        name?: string;
        duration_ms?: number;
        album?: { name?: string; images?: Array<{ url: string }> };
        artists?: Array<{ name: string }>;
      } | null;
    };
    const item = json.item;
    if (!item?.name) return 'idle';
    return {
      song: item.name,
      artist: item.artists?.map((a) => a.name).join(', ') ?? 'Unknown artist',
      albumName: item.album?.name,
      albumCover: item.album?.images?.[0]?.url ?? '',
      progressMs: json.progress_ms ?? 0,
      durationMs: item.duration_ms ?? 0,
      isPlaying: json.is_playing,
    };
  } catch (err) {
    console.warn('[spotify-poller] now-playing network error:', err);
    return null;
  }
}

/** Build the spotify Activity the client UI consumes. */
function toActivity(np: NowPlaying): Activity {
  return {
    type: 'spotify',
    name: np.song,
    details: np.artist,
    state: np.albumName,
    assets: { largeImage: np.albumCover },
    spotify: {
      song: np.song,
      artist: np.artist,
      albumName: np.albumName,
      albumCover: np.albumCover,
      progressMs: np.progressMs,
      durationMs: np.durationMs,
      isPlaying: np.isPlaying,
      fetchedAt: Date.now(),
    },
  };
}

/** Broadcast a user's presence with the given activity list (or clear it). */
function broadcastPresence(userId: string, activities: Activity[]): void {
  const status = connectionManager.getUserStatus(userId);
  const payload = { type: 'presence_update' as const, userId, status, activities };
  // The owner ALWAYS receives their own presence — they must see their own
  // vinyl in their profile popout/modal.
  connectionManager.sendToUser(userId, payload);
  // Fan-out to everyone who can see this user's profile (friends, space
  // co-members, DM co-members) — same targeting as the manual activity handler.
  void import('../utils/userDeletion.js').then(({ collectProfileBroadcastTargetIds }) => {
    for (const uid of collectProfileBroadcastTargetIds(userId)) {
      if (uid !== userId) connectionManager.sendToUser(uid, payload);
    }
  });
}

async function pollOnce(): Promise<void> {
  const db = getDb();
  const rows = db.select().from(spotifyTokens).all();
  const now = Date.now();

  for (const row of rows) {
    // Free account (403 already seen): this path can never work — skip
    // silently and forever. The window-title detector feeds the widget.
    if (freeAccountPollingDisabled.has(row.userId)) continue;

    let accessToken = row.accessToken;

    // Refresh if expired (60s margin already baked into expiresAt).
    if (row.expiresAt <= now) {
      const refreshed = await refreshAccessToken(row.userId, row.refreshToken);
      if (!refreshed) continue;
      accessToken = refreshed.accessToken;
    }

    const np = await fetchNowPlaying(accessToken);
    if (np === 'forbidden') {
      // First (and only) 403 for this user: mark and go silent. No retry,
      // no more logs — Spotify answered definitively (Premium required).
      freeAccountPollingDisabled.add(row.userId);
      console.log(`[spotify-poller] 403 for ${row.userId.slice(0, 6)}*** — free account, now-playing polling disabled for this user (window-title detection continues)`);
      continue;
    }
    if (np === null) continue; // transient error — keep previous state

    const wasActive = lastActiveAt.has(row.userId);

    if (np === 'idle' || !np.isPlaying) {
      // Grace period: keep showing for GRACE_PERIOD_MS after the last active
      // moment, then clear.
      if (wasActive && now - (lastActiveAt.get(row.userId) ?? 0) > GRACE_PERIOD_MS) {
        lastActiveAt.delete(row.userId);
        const existing = connectionManager.getUserActivities(row.userId);
        if (existing.some((a) => a.type === 'spotify')) {
          connectionManager.setUserActivities(
            row.userId,
            existing.filter((a) => a.type !== 'spotify'),
          );
          broadcastPresence(row.userId, connectionManager.getUserActivities(row.userId));
        }
      }
      if (!wasActive) continue;
      continue;
    }

    lastActiveAt.set(row.userId, now);
    const activity = toActivity(np);
    // Replace any previous spotify activity, keep others (custom status etc.).
    const others = connectionManager.getUserActivities(row.userId).filter((a) => a.type !== 'spotify');
    const merged = [activity, ...others];
    connectionManager.setUserActivities(row.userId, merged);
    broadcastPresence(row.userId, merged);

    db.update(spotifyTokens).set({ lastPolledAt: now }).where(eq(spotifyTokens.userId, row.userId)).run();
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startSpotifyPoller(): void {
  if (timer) return;
  if (!process.env.SPOTIFY_CLIENT_ID) {
    console.log('[spotify-poller] SPOTIFY_CLIENT_ID not set — presence polling disabled');
    return;
  }
  timer = setInterval(() => {
    void pollOnce().catch((err) => console.error('[spotify-poller] tick failed:', err));
  }, POLL_INTERVAL_MS);
  console.log('[spotify-poller] started — polling every 45s');
}

export function stopSpotifyPoller(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

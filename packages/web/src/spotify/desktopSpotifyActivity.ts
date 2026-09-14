import type { Activity, ActivitySpotify } from '@backspace/shared';
import { useAuthStore } from '../stores/authStore';

/**
 * Desktop Spotify "Vía A" promotion (renderer side).
 *
 * The Electron main process parses Spotify's window title and sends a
 * 'listening' activity named "Spotify" carrying a `spotify` payload with
 * { song, artist, albumCover? } (see packages/desktop/src/spotifyDesktop.ts).
 *
 * This module:
 *  1. Promotes that activity to the RICH `type:'spotify'` shape the music
 *     card consumes — with an in-memory cover cache (24h) keyed by track.
 *  2. Resolves missing covers through the Home instance's Spotify search
 *     endpoint (server-side Client Credentials; no secrets in the renderer).
 *  3. Builds the progress model: desktop detection has no playback position,
 *     so the card shows the track without a progress bar (times hidden —
 *     the card already degrades gracefully when durationMs === 0).
 */

interface DesktopSpotifyPayload {
  song: string;
  artist: string;
  albumCover?: string;
}

/** 24h in-memory cover cache keyed by lowercase track. */
const COVER_TTL_MS = 24 * 60 * 60 * 1000;
const coverCache = new Map<string, { url: string | null; fetchedAt: number }>();

/** Extract the desktop track payload from an activity (defensively). */
function desktopPayload(activity: Activity): DesktopSpotifyPayload | null {
  const raw = (activity as { spotify?: unknown }).spotify;
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.song !== 'string' || p.song.trim().length === 0) return null;
  if (typeof p.artist !== 'string' || p.artist.trim().length === 0) return null;
  return {
    song: p.song.trim(),
    artist: p.artist.trim(),
    albumCover: typeof p.albumCover === 'string' && p.albumCover.startsWith('https://') ? p.albumCover : undefined,
  };
}

/**
 * Build the rich spotify activity from a desktop-detected track.
 * `fetchedAt = now` → the card's clock starts at zero progress; with no
 * duration the times/progress UI stays hidden by design.
 */
export function desktopSpotifyToRichActivity(activity: Activity): Activity {
  const payload = desktopPayload(activity);
  if (!payload) return activity;
  const spotify: ActivitySpotify = {
    song: payload.song,
    artist: payload.artist,
    albumName: undefined,
    albumCover: payload.albumCover ?? '',
    progressMs: 0,
    durationMs: 0,
    isPlaying: true,
    fetchedAt: Date.now(),
  };
  return { ...activity, type: 'spotify', spotify };
}

/**
 * Resolve a missing cover for a promoted desktop activity via the instance
 * Spotify search endpoint. Best-effort: on failure the card renders its
 * generic VERTEX vinyl. Cached 24h per track.
 */
export async function resolveCoverForDesktopSpotify(spotify: ActivitySpotify): Promise<Activity> {
  const key = `${spotify.song.toLowerCase()}::${spotify.artist.toLowerCase()}`;
  if (spotify.albumCover) return { type: 'spotify', name: 'Spotify', spotify };

  const hit = coverCache.get(key);
  const fresh = hit && Date.now() - hit.fetchedAt < COVER_TTL_MS;
  const url = fresh ? hit!.url : await fetchCoverFromInstance(spotify.song, spotify.artist);
  if (!fresh) {
    // Only cache SUCCESSFUL lookups. Caching `null` here used to poison the
    // cover for 24h after one transient failure (server restart, network
    // blip) — the widget then showed the fallback logo forever even though
    // the cover exists upstream. A miss is cheap to retry on the next poll.
    if (url) coverCache.set(key, { url, fetchedAt: Date.now() });
  }

  return {
    type: 'spotify',
    name: 'Spotify',
    spotify: url ? { ...spotify, albumCover: url } : spotify,
  };
}

/** GET /api/spotify/search-cover → { url } | null. Server holds the creds. */
async function fetchCoverFromInstance(song: string, artist: string): Promise<string | null> {
  try {
    const qs = new URLSearchParams({ song, artist }).toString();
    // The endpoint is authenticated — the session token is required (same
    // pattern as stores/spotifyStore.ts) or the request 401s and the card
    // would never resolve a cover for desktop-detected tracks.
    const token = useAuthStore.getState().token;
    const res = await fetch(`/api/spotify/search-cover?${qs}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'omit',
    });
    if (!res.ok) {
      // [TEMP-TRACE] cover fetch diagnostics
      console.log(`[vinyl-cover fetch] miss http=${res.status} song="${song}"`);
      return null;
    }
    const data = (await res.json()) as { url?: unknown };
    const found = typeof data.url === 'string' && data.url.startsWith('https://') ? data.url : null;
    // [TEMP-TRACE] cover fetch diagnostics
    console.log(`[vinyl-cover fetch] ${found ? 'hit' : 'no-cover'} song="${song}"`);
    return found;
  } catch (err) {
    // [TEMP-TRACE] cover fetch diagnostics
    console.log(`[vinyl-cover fetch] error song="${song}"`, err);
    return null;
  }
}

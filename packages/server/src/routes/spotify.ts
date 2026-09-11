import type { FastifyInstance, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { spotifyTokens } from '../db/schema.js';
import { authenticate } from '../utils/auth.js';

/**
 * Spotify account connection (Web API, authorization code flow).
 *
 *  - GET  /api/spotify/status     → connected? spotify user name?
 *  - GET  /api/spotify/authorize  → 302 to Spotify's consent screen
 *  - GET  /api/spotify/callback   → Spotify redirects here; server exchanges
 *    the code for tokens (client secret lives ONLY here) and 302s back to the
 *    app with ?spotify=connected|error
 *  - POST /api/spotify/disconnect → wipe stored tokens
 *
 * Token refresh is handled in utils/spotifyPoller.ts (shared with the
 * presence worker).
 */

const SPOTIFY_AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_SEARCH_URL = 'https://api.spotify.com/v1/search';

/** Scopes needed for currently-playing presence. */
export const SPOTIFY_SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-read-currently-playing',
  'user-read-playback-state',
].join(' ');

/** Backend env config — the client secret never leaves the server. */
export function spotifyConfig(): { clientId: string; clientSecret: string; redirectUri: string } | null {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  // Placeholder values from .env.example must not count as configured.
  if (clientId.includes('PEGA_AQUI') || clientSecret.includes('PEGA_AQUI')) return null;
  const redirectUri =
    process.env.SPOTIFY_REDIRECT_URI ?? `${process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173'}/api/spotify/callback`;
  return { clientId, clientSecret, redirectUri };
}

/** Exchange an authorization code for tokens (called from the callback). */
export async function exchangeCodeForTokens(
  code: string,
): Promise<{ ok: true; tokens: SpotifyTokenPair; spotifyUser: string | null } | { ok: false; error: string }> {
  const cfg = spotifyConfig();
  if (!cfg) return { ok: false, error: 'not_configured' };

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: cfg.redirectUri,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });

  try {
    const res = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('[spotify] token exchange failed:', res.status, text.slice(0, 200));
      return { ok: false, error: 'token_exchange_failed' };
    }
    const json = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    if (!json.refresh_token) {
      // Very rare on first authorization, but guard anyway.
      return { ok: false, error: 'no_refresh_token' };
    }
    // Fetch the Spotify display name for the settings UI.
    let spotifyUser: string | null = null;
    try {
      const meRes = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${json.access_token}` },
      });
      if (meRes.ok) {
        const me = (await meRes.json()) as { display_name?: string };
        spotifyUser = me.display_name ?? null;
      }
    } catch {
      // non-fatal
    }
    return {
      ok: true,
      tokens: {
        accessToken: json.access_token,
        refreshToken: json.refresh_token,
        expiresAt: Date.now() + (json.expires_in - 60) * 1000,
      },
      spotifyUser,
    };
  } catch (err) {
    console.error('[spotify] token exchange network error:', err);
    return { ok: false, error: 'network' };
  }
}

export interface SpotifyTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

// ─── Desktop track cover lookup (Client Credentials, 24h cache) ─────────────

interface ClientCredsToken {
  value: string;
  expiresAt: number;
}

let clientCredsToken: ClientCredsToken | null = null;

/** Cache entry per track — stores null on failure (negative cache). */
interface CoverCacheEntry {
  url: string | null;
  fetchedAt: number;
}

const COVER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const COVER_CACHE_MAX = 500;
const coverCache = new Map<string, CoverCacheEntry>();
const coversInFlight = new Map<string, Promise<string | null>>();

/**
 * App token via the Client Credentials grant. Falls back to the OAuth app
 * credentials' own authorization when only those are configured.
 * Returns null when Spotify credentials are not configured at all.
 */
async function getAppAccessToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  if (clientId.includes('PEGA_AQUI') || clientSecret.includes('PEGA_AQUI')) return null;

  if (clientCredsToken && clientCredsToken.expiresAt > Date.now() + 5_000) {
    return clientCredsToken.value;
  }
  try {
    const res = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (typeof json.access_token !== 'string') return null;
    clientCredsToken = {
      value: json.access_token,
      expiresAt: Date.now() + (typeof json.expires_in === 'number' ? json.expires_in * 1000 : 3600_000),
    };
    return clientCredsToken.value;
  } catch {
    return null;
  }
}

async function searchTrackCover(song: string, artist: string): Promise<string | null> {
  const token = await getAppAccessToken();
  if (!token) return null;
  try {
    const qs = new URLSearchParams({ q: `track:${song} artist:${artist}`, type: 'track', limit: '1' }).toString();
    const res = await fetch(`${SPOTIFY_API_SEARCH_URL}?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      tracks?: { items?: Array<{ album?: { images?: Array<{ url?: string; width?: number }> } }> };
    };
    const images = json.tracks?.items?.[0]?.album?.images;
    if (!Array.isArray(images) || images.length === 0) return null;
    // Prefer a ~300–640px image; otherwise the first (largest).
    const preferred =
      images.find((i) => typeof i.width === 'number' && i.width >= 300 && i.width <= 640) ?? images[0];
    return typeof preferred?.url === 'string' && preferred.url.startsWith('https://') ? preferred.url : null;
  } catch {
    return null;
  }
}

/** Cached cover URL for a track; failures are cached too (24h negative TTL). */
export async function getTrackCoverUrl(song: string, artist: string): Promise<string | null> {
  const key = `${song.toLowerCase().slice(0, 120)}::${artist.toLowerCase().slice(0, 120)}`;
  const hit = coverCache.get(key);
  if (hit && Date.now() - hit.fetchedAt < COVER_CACHE_TTL_MS) return hit.url;

  const inflight = coversInFlight.get(key);
  if (inflight) return inflight;

  const job = searchTrackCover(song, artist)
    .then((url) => {
      // Simple size cap — drop the oldest entry when full.
      if (coverCache.size >= COVER_CACHE_MAX) {
        const oldest = coverCache.keys().next().value;
        if (oldest !== undefined) coverCache.delete(oldest);
      }
      coverCache.set(key, { url, fetchedAt: Date.now() });
      return url;
    })
    .finally(() => coversInFlight.delete(key));
  coversInFlight.set(key, job);
  return job;
}

export async function spotifyRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Browser navigation (window.location.href → the connect button) cannot set
   * an Authorization header, so the authorize endpoint ALSO accepts the
   * session token as `?token=` (same short-lived JWT the SPA already holds;
   * verified identically to the header path). status/disconnect remain
   * header-authenticated — the SPA calls those with its normal client.
   */
  app.addHook('preHandler', async (request, reply) => {
    if (request.url.startsWith('/api/spotify/authorize') && !request.headers.authorization) {
      const token = (request.query as Record<string, string | undefined>).token;
      if (typeof token === 'string' && token.length > 0) {
        request.headers.authorization = `Bearer ${token}`;
      }
    }
  });

  // Connection status for the settings UI / profile modal.
  app.get('/api/spotify/status', { preHandler: authenticate }, async (request, reply) => {
    const userId = (request as FastifyRequest & { userId: string }).userId;
    const db = getDb();
    const row = db.select().from(spotifyTokens).where(eq(spotifyTokens.userId, userId)).get();
    void reply.send({
      connected: !!row,
      spotifyUser: row?.spotifyUser ?? null,
    });
  });

  // Kick off the OAuth flow. Requires configured credentials.
  app.get('/api/spotify/authorize', { preHandler: authenticate }, async (request, reply) => {
    const cfg = spotifyConfig();
    if (!cfg) {
      void reply.code(503).send({ error: 'spotify_not_configured' });
      return;
    }
    const userId = (request as FastifyRequest & { userId: string }).userId;
    // State carries the userId (short-lived, unpredictable) for CSRF safety.
    const state = crypto.randomBytes(16).toString('hex') + '.' + userId;
    pendingStates.set(state, Date.now());
    const url = new URL(SPOTIFY_AUTHORIZE_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', cfg.clientId);
    url.searchParams.set('scope', SPOTIFY_SCOPES);
    url.searchParams.set('redirect_uri', cfg.redirectUri);
    url.searchParams.set('state', state);
    void reply.redirect(url.toString());
  });

  // Spotify redirects here after consent. Exchange code → tokens, store, bounce
  // back to the app. Public (Spotify's server-to-server redirect).
  app.get('/api/spotify/callback', async (request, reply) => {
    const q = request.query as Record<string, string | undefined>;
    const appOrigin = process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173';
    const back = (status: 'connected' | 'error', detail?: string) =>
      `${appOrigin}/settings?spotify=${status}${detail ? `&detail=${detail}` : ''}`;

    const state = q.state ?? '';
    const userId = state.split('.').slice(1).join('.');
    if (!state || !pendingStates.has(state) || !userId) {
      return reply.redirect(back('error', 'bad_state'));
    }
    pendingStates.delete(state);
    // 10-minute state lifetime.
    for (const [k, t] of pendingStates) if (Date.now() - t > 10 * 60 * 1000) pendingStates.delete(k);

    if (q.error) {
      console.warn('[spotify] OAuth error from Spotify:', q.error);
      return reply.redirect(back('error', q.error));
    }
    if (!q.code) return reply.redirect(back('error', 'missing_code'));

    const result = await exchangeCodeForTokens(q.code);
    if (!result.ok) return reply.redirect(back('error', result.error));

    const db = getDb();
    db.insert(spotifyTokens)
      .values({
        userId,
        spotifyUser: result.spotifyUser,
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
        expiresAt: result.tokens.expiresAt,
        connectedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: spotifyTokens.userId,
        set: {
          spotifyUser: result.spotifyUser,
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          expiresAt: result.tokens.expiresAt,
          connectedAt: Date.now(),
        },
      })
      .run();

    console.log('[spotify] connected for user', userId, result.spotifyUser ? `as ${result.spotifyUser}` : '');
    return reply.redirect(back('connected'));
  });

  /**
   * Cover lookup for desktop-detected tracks (free accounts, Vía A).
   * The desktop app parses "Song - Artist" from Spotify's window title and
   * needs artwork: this endpoint resolves it server-side with the Client
   * Credentials app token — the client secret NEVER reaches the renderer.
   * Cached 24h per track (negatives included). Fails open with url:null so
   * the card renders its generic vinyl.
   */
  app.get('/api/spotify/search-cover', { preHandler: authenticate }, async (request, reply) => {
    const q = request.query as { song?: string; artist?: string };
    const song = (q.song ?? '').trim().slice(0, 120);
    const artist = (q.artist ?? '').trim().slice(0, 120);
    if (!song || !artist) {
      return reply.code(400).send({ error: 'song and artist are required' });
    }
    const url = await getTrackCoverUrl(song, artist);
    return reply.code(200).send({ url });
  });

  // Disconnect: wipe the stored tokens.
  app.post('/api/spotify/disconnect', { preHandler: authenticate }, async (request, reply) => {
    const userId = (request as FastifyRequest & { userId: string }).userId;
    const db = getDb();
    db.delete(spotifyTokens).where(eq(spotifyTokens.userId, userId)).run();
    console.log('[spotify] disconnected for user', userId);
    void reply.send({ ok: true });
  });
}

/** In-memory OAuth state store (CSRF protection). */
const pendingStates = new Map<string, number>();

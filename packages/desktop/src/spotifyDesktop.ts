import { execFile } from 'child_process';
import https from 'https';

/**
 * Spotify desktop enrichment — "Vía A" for FREE Spotify accounts.
 *
 * When the process detector sees Spotify running, this module:
 *  1. Reads the title of Spotify's window via the native window listing
 *     (`getWindows()` electron main API, best-effort, no extra deps).
 *  2. Parses "Song - Artist" / "Song — Artist" / "Song | Artist".
 *     Anything unparseable (ads, menus, the bare app name) returns null —
 *     the caller then emits the generic "Spotify" activity or nothing.
 *  3. Resolves the album cover through the Spotify Web API search endpoint
 *     with CLIENT CREDENTIALS (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET env).
 *     Results are cached 24h per track; failures return null (generic vinyl).
 *
 * Everything here is fail-open: any error resolves to null and the detector
 * keeps working without song data. No secrets ever leave the main process —
 * the renderer only ever receives a cover URL.
 */

/** Parsed track from a Spotify window title. */
export interface SpotifyTrackInfo {
  song: string;
  artist: string;
}

// ─── Window title acquisition ───────────────────────────────────────────────

interface NativeWindowInfo {
  name?: unknown;
}

/**
 * Read the front-most Spotify window title across platforms.
 * - Windows: `tasklist /v /fo csv /nh` (last column = window title).
 * - macOS:   AppleScript via osascript, System Events window names.
 * - Linux:   `wmctrl -l` or `xdotool search --name Spotify getwindowname`.
 */
function getSpotifyWindowTitle(): Promise<string | null> {
  return new Promise((resolve) => {
    const platform = process.platform;
    const done = (value: string | null): void => {
      resolve(value && value.trim().length > 0 ? value.trim() : null);
    };

    if (platform === 'win32') {
      // PowerShell Get-Process — tasklist /v truncates output on this machine
      // (dies partway through the process list), while this always returns the
      // front-window title. Only processes WITH a MainWindowTitle come back,
      // so a hit means a real visible window (not a background helper).
      // UTF-8 output encoding: 'está' must survive the pipe.
      execFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '[Console]::OutputEncoding=[Text.Encoding]::UTF8; ' +
            '$t = (Get-Process Spotify -ErrorAction SilentlyContinue | ' +
            'Where-Object { $_.MainWindowTitle } | Select-Object -First 1).MainWindowTitle; ' +
            "if ($t) { [Console]::Out.Write($t) } else { [Console]::Out.Write('') }",
        ],
        { timeout: 6000, windowsHide: true, maxBuffer: 1024 * 64, encoding: 'utf8' },
        (err, stdout) => {
          if (err || !stdout) return done(null);
          done(stdout);
        },
      );
      return;
    }

    if (platform === 'darwin') {
      // Needs accessibility/automation permission; fail-open when denied.
      execFile(
        'osascript',
        ['-e', 'tell application "System Events" to get name of every window of (every process whose name is "Spotify")'],
        { timeout: 6000 },
        (err, stdout) => {
          if (err || !stdout) return done(null);
          done(stdout);
        },
      );
      return;
    }

    // Linux: wmctrl first, xdotool fallback.
    execFile('wmctrl', ['-l'], { timeout: 6000 }, (err, stdout) => {
      if (!err && stdout) {
        done(findSpotifyTitleFromWindowList(stdout));
        return;
      }
      execFile(
        'xdotool',
        ['search', '--name', 'Spotify', 'getwindowname', '%@'],
        { timeout: 6000 },
        (err2, stdout2) => {
          if (err2 || !stdout2) return done(null);
          done(findSpotifyTitleFromWindowList(stdout2));
        },
      );
    });
  });
}

/** Windows: tasklist /v CSV rows — image name first, window title LAST. */
function findSpotifyTitleFromTasklist(stdout: string): string | null {
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || !/spotify/i.test(trimmed)) continue;
    // Split on `","` boundaries — the CSV fields are all double-quoted.
    const fields = trimmed
      .replace(/^"|"$/g, '')
      .split('","')
      .map((f) => f.trim());
    // Image name is field 0; window title is the final field (/v ordering).
    const imageName = fields[0] ?? '';
    const title = fields[fields.length - 1] ?? '';
    if (/^spotify(\.exe)?$/i.test(imageName) && title && !/^n\/a$/i.test(title)) {
      return title;
    }
  }
  return null;
}

/** Linux: wmctrl/xdotool list lines — "handle  desktop  host  Title". */
function findSpotifyTitleFromWindowList(stdout: string): string | null {
  const candidates = stdout.split('\n').filter((l) => /spotify/i.test(l));
  // Prefer a line that actually parses as a track; fall back to the raw line.
  for (const line of candidates) {
    // wmctrl rows: strip the first three whitespace-separated columns.
    const title = line.replace(/^\s*\S+\s+\S+\s+\S+\s*/, '').trim();
    if (title && parseSpotifyWindowTitle(title)) return title;
  }
  return candidates.length > 0 ? candidates[0]!.trim() : null;
}

// ─── Title parsing ──────────────────────────────────────────────────────────

/**
 * Strip app-name decoration Spotify adds around the track:
 * "Spotify Premium", "Spotify Free", bare "Spotify" tokens, plus any
 * dangling separator left behind. Applied BEFORE the separator split so
 * "Song - Artist - Spotify Premium" parses as Song/Artist, not
 * Song/"Artist - Spotify Premium".
 */
function stripAppSuffixes(title: string): string {
  let out = title;
  for (let i = 0; i < 4; i++) {
    const before = out;
    out = out
      .replace(/(?:^|[\s\u2014\u2013|\-]\s*)Spotify\s*(?:Premium|Free|Online)?\s*(?=[\s\u2014\u2013|\-]|$)/gi, ' ')
      .replace(/^[\s\u2014\u2013|\-]+|[\s\u2014\u2013|\-]+$/g, '')
      .trim();
    if (out === before) break;
  }
  return out;
}

/**
 * Parse the Spotify window title into a track.
 *
 * LIVE-CONFIRMED ORDER (es-ES desktop, 2026-09, `tasklist /v`):
 * "Artist - Song" — e.g. "Omar Courtz - Comernos". The left side of the
 * first separator is the ARTIST, the right side the SONG.
 *
 * Returns null only for what is NOT music: the bare app name, app-name
 * variants, and placeholder titles ("N/D", "N/A" — the non-playing
 * Spotify.exe helper windows).
 *
 * PLAN B — a separator-less title (some locales/contexts) is still real
 * music the user is hearing: the raw title becomes the song, with the app
 * name as the artist placeholder, so the card shows something real instead
 * of the generic "Spotify".
 */
export function parseSpotifyWindowTitle(rawTitle: string | null | undefined): SpotifyTrackInfo | null {
  if (!rawTitle) return null;
  const title = stripAppSuffixes(rawTitle.trim());
  if (!title || title.length < 3 || title.length > 200) return null;
  // Bare app name or app-name-only variants → no track info.
  if (/^spotify(\s*(premium|free|online))?$/i.test(title)) return null;
  // Placeholder titles (Spanish "N/D", English "N/A") on helper windows.
  if (/^n\s*[/\\]\s*[da]?\.?$/i.test(title)) return null;

  for (const sep of ['—', '–', '|', '-']) {
    const idx = title.indexOf(sep);
    if (idx === -1) continue;
    const left = title.slice(0, idx).trim();
    const right = title.slice(idx + sep.length).trim();
    if (isValidTrackPart(left) && isValidTrackPart(right)) {
      // Confirmed live order: "Artist - Song".
      return { song: truncate(right, 128), artist: truncate(left, 128) };
    }
    return null; // A separator exists but one side is junk — not a track.
  }

  // PLAN B — no separator: raw title as the song, app name as the artist.
  if (isValidTrackPart(title)) {
    return { song: truncate(title, 128), artist: 'Spotify' };
  }
  return null;
}

/**
 * Both sides of a separator must be non-empty, not "spotify", and printable.
 * Also rejects placeholder text ("N/D", "N/A", "-") seen on helper windows.
 */
function isValidTrackPart(part: string): boolean {
  if (!part || part.length < 1) return false;
  if (part.length > 120) return false;
  if (/^spotify(\s*free)?$/i.test(part)) return false;
  // Placeholder titles (Spanish "N/D", English "N/A") and lone separators.
  if (/^n\s*[/\\]\s*[da]?\.?$/i.test(part)) return false;
  if (/^[\s\u2014\u2013|\-]+$/.test(part)) return false;
  // Reject control characters (clipboard/screen garbage guard).
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(part)) return false;
  return true;
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max).trim() : value;
}

// ─── Cover resolution (Spotify Web API, Client Credentials) ─────────────────

interface CoverCacheEntry {
  url: string | null;
  fetchedAt: number;
}

const COVER_TTL_MS = 24 * 60 * 60 * 1000; // 24h per track
const coverCache = new Map<string, CoverCacheEntry>();
const inFlight = new Map<string, Promise<string | null>>();

function clientCredentials(): { id: string; secret: string } | null {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

/** POST /api/token with the Client Credentials grant. 5-min safety margin. */
async function getAppToken(): Promise<string | null> {
  const creds = clientCredentials();
  if (!creds) return null;
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5_000 && cachedToken.value) {
    return cachedToken.value;
  }

  const body = new URLSearchParams({ grant_type: 'client_credentials' }).toString();
  const basic = Buffer.from(`${creds.id}:${creds.secret}`).toString('base64');
  const status = await requestJson(
    'POST',
    'https://accounts.spotify.com/api/token',
    {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': String(Buffer.byteLength(body)),
    },
    body,
  );
  if (!status || status.code !== 200 || typeof status.json?.access_token !== 'string') return null;
  cachedToken = {
    value: status.json.access_token as string,
    expiresAt: Date.now() + (typeof status.json.expires_in === 'number' ? status.json.expires_in * 1000 : 3600_000),
  };
  return cachedToken.value;
}

/**
 * Cover URL for a track, cached 24h. Cache stores nulls too (negative cache)
 * so ad/menu windows or rate limits do not hammer the API every 15s poll.
 */
export async function getSpotifyCoverUrl(song: string, artist: string): Promise<string | null> {
  const key = `${song.toLowerCase()}::${artist.toLowerCase()}`;
  const hit = coverCache.get(key);
  if (hit && Date.now() - hit.fetchedAt < COVER_TTL_MS) return hit.url;

  const existing = inFlight.get(key);
  if (existing) return existing;

  const job = (async (): Promise<string | null> => {
    const url = await fetchCoverUrl(song, artist);
    coverCache.set(key, { url, fetchedAt: Date.now() });
    return url;
  })();
  inFlight.set(key, job);
  try {
    return await job;
  } finally {
    inFlight.delete(key);
  }
}

async function searchOnce(token: string, q: string): Promise<string | null> {
  const query = new URLSearchParams({ q, type: 'track', limit: '1' }).toString();
  const res = await requestJson('GET', `https://api.spotify.com/v1/search?${query}`, {
    Authorization: `Bearer ${token}`,
  });
  const items = (res?.json as { tracks?: { items?: unknown } } | null | undefined)?.tracks?.items;
  const first = Array.isArray(items) ? items[0] : undefined;
  const images = first?.album?.images;
  if (Array.isArray(images)) {
    // Prefer a ~300px image; fall back to the largest available.
    const preferred =
      images.find((i: { width?: unknown }) => typeof i.width === 'number' && i.width >= 300 && i.width <= 640) ??
      images[0];
    if (preferred && typeof preferred.url === 'string') return preferred.url;
  }
  return null;
}

async function fetchCoverUrl(song: string, artist: string): Promise<string | null> {
  try {
    const token = await getAppToken();
    if (!token) return null;

    // 1. Field-filtered search (most precise when the Song/Artist split is right).
    const filtered = await searchOnce(token, `track:${song} artist:${artist}`);
    if (filtered) return filtered;
    // 2. Free-text fallback — order-agnostic, still finds the track when the
    //    title order was guessed wrong (see parseSpotifyWindowTitle note).
    return await searchOnce(token, `${song} ${artist}`);
  } catch {
    return null;
  }
}

/** Minimal HTTPS request helper (node https, no deps). JSON or null. */
function requestJson(
  method: 'GET' | 'POST',
  url: string,
  headers: Record<string, string>,
  body?: string,
): Promise<{ code: number; json: Record<string, unknown> | null } | null> {
  return new Promise((resolve) => {
    try {
      const req = https.request(
        url,
        { method, headers, timeout: 8000 },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            try {
              const raw = Buffer.concat(chunks).toString('utf-8');
              resolve({ code: res.statusCode ?? 0, json: raw ? (JSON.parse(raw) as Record<string, unknown>) : null });
            } catch {
              resolve(null);
            }
          });
          res.on('error', () => resolve(null));
        },
      );
      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
      if (body) req.write(body);
      req.end();
    } catch {
      resolve(null);
    }
  });
}

// ─── Diagnostic logging (temporary — title format confirmation) ────────

/** Deduped log: only log when the raw title changes (not every 15s poll). */
let lastLoggedTitle: string | null = null;
function logSpotifyTitle(rawTitle: string | null): void {
  if (rawTitle === lastLoggedTitle) return;
  lastLoggedTitle = rawTitle;
  const track = parseSpotifyWindowTitle(rawTitle);
  if (rawTitle) {
    // [TEMP-TRACE a] raw window title + parser result
    console.log(
      `[spotify-parse] title="${rawTitle}" → ${track ? `song="${track.song}" artist="${track.artist}"` : 'unparseable (generic activity)'}`,
    );
  } else {
    console.log('[spotify-parse] no Spotify window title readable');
  }
}

// ─── Enrichment entry point ─────────────────────────────────────────────────

/** Extended activity with the song payload. */
export interface SpotifyEnrichment {
  song: string;
  artist: string;
  albumCover?: string;
}

/**
 * Enrich a running Spotify process: read the window title, parse the track
 * and resolve the cover. Resolves null when the title is unparseable (ads,
 * menus) — the caller must not emit a track activity in that case.
 */
export async function getSpotifyEnrichment(): Promise<SpotifyEnrichment | null> {
  const title = await getSpotifyWindowTitle();
  logSpotifyTitle(title);
  const track = parseSpotifyWindowTitle(title);
  if (!track) return null;

  const albumCover = await getSpotifyCoverUrl(track.song, track.artist);
  return { song: track.song, artist: track.artist, albumCover: albumCover ?? undefined };
}

/** Test-only cache inspection. */
export function peekCoverCache(key: string): CoverCacheEntry | undefined {
  return coverCache.get(key);
}

/** Test-only cache reset. */
export function resetCoverCacheForTests(): void {
  coverCache.clear();
  inFlight.clear();
  cachedToken = null;
}

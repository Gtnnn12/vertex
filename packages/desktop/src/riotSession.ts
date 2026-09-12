import fs from 'fs';
import https from 'https';
import path from 'path';

/**
 * Riot Client local session reader (VALORANT enrichment).
 *
 * When the Riot Client runs it writes a lockfile at
 *   %LOCALAPPDATA%\Riot Games\Riot Client\Config\lockfile
 * with the format `name:PID:port:password:protocol`. That grants access to
 * the client's LOCAL https API (Basic auth `riot:<password>`, self-signed
 * certificate → rejectUnauthorized: false).
 *
 * We query only the lightweight session endpoint:
 *   GET /chat/v4/session  →  { chats: [...], ... } with per-player
 *   { lol_state, lol_map, lol_mode, ... } — no PII beyond the local player.
 *
 * Everything fails soft: no lockfile, closed client, timeout or malformed
 * body → null. The caller must NEVER invent data from a null.
 */

export interface RiotMatchInfo {
  /** 'menu' | 'ingame' — real session state from the client. */
  state: 'menu' | 'ingame';
  /** Real map name when known (e.g. "Split"), else undefined. */
  map?: string;
  /** Real queue/mode name when known (e.g. "Swiftplay"), else undefined. */
  mode?: string;
}

const LOCKFILE_DIR = path.join(
  process.env.LOCALAPPDATA ?? '',
  'Riot Games', 'Riot Client', 'Config', 'lockfile',
);

const REQUEST_TIMEOUT_MS = 2500;

/** Minimal raw request with Basic auth against the self-signed local API. */
function localGet(port: string, password: string, reqPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const auth = Buffer.from(`riot:${password}`).toString('base64');
    const req = https.get(
      {
        host: '127.0.0.1',
        port,
        path: reqPath,
        headers: { Authorization: `Basic ${auth}` },
        rejectUnauthorized: false,
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(null);
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve(body));
      },
    );
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

/** Read + parse the lockfile; null when absent or malformed. */
function readLockfile(): { port: string; password: string } | null {
  try {
    const raw = fs.readFileSync(LOCKFILE_DIR, 'utf8').trim();
    const parts = raw.split(':');
    // name:PID:port:password:protocol
    const port = parts[2] ?? '';
    const password = (parts[3] ?? '').replace(/^"|"$/g, '');
    if (!/^\d+$/.test(port) || !password) return null;
    return { port, password };
  } catch {
    return null; // No lockfile = client not running (or unreadable) — normal.
  }
}

/** lol_state / lol_map / lol_mode → our normalized MatchInfo (or null). */
function parseSession(body: string): RiotMatchInfo | null {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  const chats = (json as { chats?: Array<Record<string, unknown>> }).chats;
  if (!Array.isArray(chats) || chats.length === 0) return null;

  // The local player's row: presence summary fields live directly on the chat entry.
  const me = chats[0];
  if (!me) return null;
  const state = typeof me.lol_state === 'string' ? me.lol_state : '';
  if (!state) return null;

  const ingame = /inGame|in_game/i.test(state);
  const map = typeof me.lol_map === 'string' ? me.lol_map.trim() : '';
  const mode = typeof me.lol_mode === 'string' ? me.lol_mode.trim() : '';

  return {
    state: ingame ? 'ingame' : 'menu',
    ...(map && map.toLowerCase() !== 'none' ? { map } : {}),
    ...(mode && mode.toLowerCase() !== 'none' ? { mode } : {}),
  };
}

/**
 * Poll the local Riot session. Returns null whenever we cannot PROVE a real
 * state: lockfile missing, client closed, endpoint slow/malformed.
 */
export async function getRiotMatchInfo(): Promise<RiotMatchInfo | null> {
  const lock = readLockfile();
  if (!lock) return null;
  const body = await localGet(lock.port, lock.password, '/chat/v4/session');
  if (!body) return null;
  return parseSession(body);
}

import fs from 'fs';
import https from 'https';
import path from 'path';

/**
 * Riot Client local session reader (VERIFIED against a live Valorant match).
 *
 * Source of truth: the Riot Client lockfile grants its LOCAL https API
 * (%LOCALAPPDATA%\Riot Games\Riot Client\Config\lockfile, Basic auth
 * `riot:<password>`, self-signed cert). Two endpoints:
 *
 *  - GET /chat/v4/presences → every Valorant player's presence blob (base64
 *    JSON) with `matchPresenceData`: sessionLoopState (INGAME / PREGAME /
 *    MENUS), matchMap ("/Game/Maps/Triad/Triad"), queueId ("competitive"),
 *    partyOwnerMatchScoreAllyTeam/EnemyTeam (REAL round score) and party
 *    size. The LOCAL player's row is identified by its puuid, read from the
 *    game client's own log (`SubjectBase64=` in
 *    %LOCALAPPDATA%\VALORANT\Saved\Logs\ShooterGame.log — verified: the
 *    base64 decodes to the local player's puuid, and that same puuid appears
 *    as the presence id prefix).
 *
 *  - GET /product-session/v1/sessions → the valorant product `phase`
 *    ('Gameplay' etc.) as a coarse fallback when presences are unusable.
 *
 * Everything fails soft: no lockfile, closed client, timeout, malformed body
 * → null. The caller must NEVER invent data from a null.
 */

export interface RiotMatchInfo {
  /** 'menu' | 'agents' | 'ingame' — real session state. */
  state: 'menu' | 'agents' | 'ingame';
  /** Real map name (e.g. "Triad"), pretty-printed from the map path. */
  map?: string;
  /** Real queue/mode (e.g. "competitive"), as reported by the game. */
  mode?: string;
  /** Real round score when the player is in a match (party owner's view). */
  scoreYou?: number;
  scoreThem?: number;
  /** Real party size (local player included). */
  partySize?: number;
}

const CLIENT_LOCKFILE = path.join(
  process.env.LOCALAPPDATA ?? '',
  'Riot Games', 'Riot Client', 'Config', 'lockfile',
);
const GAME_LOG = path.join(
  process.env.LOCALAPPDATA ?? '',
  'VALORANT', 'Saved', 'Logs', 'ShooterGame.log',
);

const REQUEST_TIMEOUT_MS = 2500;

/** Minimal raw GET with Basic auth against the self-signed local Riot API. */
function localGet(port: string, password: string, reqPath: string): Promise<{ status: number; body: string } | null> {
  return new Promise((resolve) => {
    const auth = Buffer.from(`riot:${password}`).toString('base64');
    const req = https.request(
      {
        host: '127.0.0.1',
        port,
        path: reqPath,
        method: 'GET',
        headers: { Authorization: `Basic ${auth}` },
        rejectUnauthorized: false,
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        const body: string[] = [];
        res.setEncoding('utf8');
        res.on('data', (chunk) => body.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: body.join('') }));
      },
    );
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
    req.end();
  });
}

/** Read + parse the Riot Client lockfile; null when absent or malformed. */
function readClientLockfile(): { port: string; password: string } | null {
  try {
    const raw = fs.readFileSync(CLIENT_LOCKFILE, 'utf8').trim();
    const parts = raw.split(':');
    const port = parts[2] ?? '';
    const password = (parts[3] ?? '').replace(/^"|"$/g, '');
    if (!/^\d+$/.test(port) || !password) return null;
    return { port, password };
  } catch {
    return null; // No lockfile = client not running (or unreadable) — normal.
  }
}

/**
 * The LOCAL player's puuid, read from the game client's own log (the game
 * writes `SubjectBase64=<base64 puuid>` in its match URLs). Cached — the
 * puuid never changes between game sessions.
 */
let cachedPuuid: string | null = null;
function getLocalPuuid(): string | null {
  if (cachedPuuid) return cachedPuuid;
  try {
    const log = fs.readFileSync(GAME_LOG, 'utf8');
    const matches = log.match(/SubjectBase64=([A-Za-z0-9+/=]+)/g);
    if (!matches || matches.length === 0) return null;
    const last = matches[matches.length - 1]!;
    const decoded = Buffer.from(last.slice('SubjectBase64='.length), 'base64').toString('utf8');
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(decoded)) {
      cachedPuuid = decoded;
      return decoded;
    }
    return null;
  } catch {
    return null;
  }
}

/** "/Game/Maps/Triad/Triad" → "Triad". */
function prettyMap(raw: string): string {
  const m = raw.match(/Maps\/([^/]+)\//);
  return m && m[1] ? m[1] : raw;
}

interface PresenceDecoded {
  sessionLoopState?: string;
  matchMap?: string;
  queueId?: string;
}
interface PresenceEntry {
  id?: string;          // "<puuid>@eu1.pvp.net"
  private?: string;     // base64 JSON
}

/**
 * Poll the local Riot Client API for the REAL Valorant session of the LOCAL
 * player. Returns null whenever nothing is provable.
 */
export async function getRiotMatchInfo(): Promise<RiotMatchInfo | null> {
  const lock = readClientLockfile();
  if (!lock) return null;

  const pres = await localGet(lock.port, lock.password, '/chat/v4/presences');
  if (pres && pres.status === 200) {
    try {
      const j = JSON.parse(pres.body) as { presences?: PresenceEntry[] };
      const myPuuid = getLocalPuuid();
      let fallback: RiotMatchInfo | null = null;

      for (const p of j.presences ?? []) {
        if (!p.private) continue;
        let d: Record<string, unknown>;
        try {
          d = JSON.parse(Buffer.from(p.private, 'base64').toString('utf8').replace(/\0/g, '')) as Record<string, unknown>;
        } catch {
          continue;
        }
        const mp = (d.matchPresenceData ?? null) as PresenceDecoded | null;
        if (!mp || !mp.sessionLoopState) continue;

        const isMe = myPuuid ? (p.id ?? '').startsWith(myPuuid) : false;
        const info = presenceToInfo(mp, d);
        if (!info) continue;
        if (isMe) return info;         // the local player's own row — exact
        if (!fallback) fallback = info; // otherwise keep one as a coarse signal
      }
      // No own presence (privacy opt-out etc.) but a live Valorant session
      // exists on this machine → coarse state without fake personal data:
      // loopstate/map are match facts, score/party are omitted (not mine).
      return fallback;
    } catch {
      // fall through to phase fallback
    }
  }

  // Coarse fallback: product phase (menu vs gameplay), no map/score/party.
  const sess = await localGet(lock.port, lock.password, '/product-session/v1/sessions');
  if (!sess || sess.status !== 200) return null;
  try {
    const j = JSON.parse(sess.body) as Record<string, { productId?: string; phase?: string }>;
    const valorant = Object.values(j).find((v) => v.productId === 'valorant');
    const phase = (valorant?.phase ?? '').trim().toLowerCase();
    if (phase === 'gameplay' || phase === 'gamelaunch') return { state: 'ingame' };
    if (phase && phase !== 'none') return { state: 'menu' };
    return null;
  } catch {
    return null;
  }
}

/** Decoded presence → normalized MatchInfo. Only real fields survive. */
function presenceToInfo(mp: PresenceDecoded, d: Record<string, unknown>): RiotMatchInfo | null {
  const loop = (mp.sessionLoopState ?? '').toUpperCase();
  const map = mp.matchMap ? prettyMap(mp.matchMap) : undefined;
  const mode = mp.queueId?.trim() || undefined;
  const scoreYou = typeof d.partyOwnerMatchScoreAllyTeam === 'number' ? d.partyOwnerMatchScoreAllyTeam : undefined;
  const scoreThem = typeof d.partyOwnerMatchScoreEnemyTeam === 'number' ? d.partyOwnerMatchScoreEnemyTeam : undefined;
  const party = (d.partyPresenceData ?? null) as { partySize?: number } | null;
  const partySize = typeof party?.partySize === 'number' && party.partySize > 0 ? party.partySize : undefined;

  if (loop === 'INGAME') {
    return {
      state: 'ingame',
      ...(map ? { map } : {}),
      ...(mode ? { mode } : {}),
      ...(scoreYou !== undefined && scoreThem !== undefined ? { scoreYou, scoreThem } : {}),
      ...(partySize ? { partySize } : {}),
    };
  }
  if (loop === 'PREGAME') {
    return { state: 'agents', ...(map ? { map } : {}), ...(mode ? { mode } : {}), ...(partySize ? { partySize } : {}) };
  }
  // MENUS / anything else → open game, no match data.
  return { state: 'menu', ...(partySize ? { partySize } : {}) };
}

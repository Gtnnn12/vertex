import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useLanguage } from '../../contexts/LanguageContext';
import type { Activity, ActivitySpotify } from '@backspace/shared';

/**
 * MATCH CARD — the "playing a game" state of the profile music widget.
 *
 * Each game gets its OWN composition (no shared generic card):
 *  - CS2 → CS2 RADAR: circular operation radar sweeping on the right
 *    (sweep + blips), military-mono data block on the left with the HUGE
 *    CT—T score as protagonist, round number and live match clock.
 *    Only the data that actually arrived renders (matchData from the
 *    GSI-shaped pipeline / dev mock); bare process → lobby standby radar
 *    + "Jugando a Counter-Strike 2". Never invented.
 *  - VALORANT (and default) → coral card: game icon with breathing glow,
 *    big game name, mode/map from the Riot lockfile enrichment, live timer.
 *
 * Spotify playing alongside → fine secondary line at the bottom of either.
 * Reduced motion: static radar, frozen clock, no entry animation.
 */

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Per-game accent colours (VERTEX-original palettes). */
const GAME_ACCENTS: Record<string, string> = {
  cs2: '#e8963c',      // tactical orange
  valorant: '#ff4655', // coral
};

/** Shared hooks/values for both card variants. */
function useMatchCardState(game: Activity, prefersReduced: boolean | null) {
  // HONESTY RULE: the process running only proves the game is open.
  // Real states from the local Riot API: 'ingame' | 'agents' | 'menu'.
  const rawState = game.state?.trim() ?? '';
  const ingame = rawState === 'ingame';
  const inAgents = rawState === 'agents';

  // Real match data (map, scores, round) when a local game API provides it.
  const matchData = game.matchData;
  const hasScore = typeof matchData?.scoreYou === 'number' && typeof matchData?.scoreThem === 'number';

  // details = "Mode · Map" (real data only — the desktop never invents it).
  const rawDetails = game.details?.trim() ?? '';
  let mode = '';
  let map = matchData?.map ?? '';
  if (rawDetails.includes('·')) {
    const [a, ...rest] = rawDetails.split('·');
    mode = a.trim();
    map = map || rest.join('·').trim();
  } else if (!map) {
    mode = rawDetails;
  }

  // Live match timer ONLY during a real match (from the real match start).
  const start = ingame ? game.timestamps?.start ?? 0 : 0;
  const [elapsed, setElapsed] = useState(() => (start ? Date.now() - start : 0));
  useEffect(() => {
    if (!start || prefersReduced) {
      setElapsed(start ? Date.now() - start : 0);
      return;
    }
    setElapsed(Date.now() - start);
    const id = setInterval(() => setElapsed(Date.now() - start), 1000);
    return () => clearInterval(id);
  }, [start, prefersReduced]);

  return { ingame, inAgents, matchData, hasScore, mode, map, start, elapsed };
}

/* ── CS2 RADAR ─────────────────────────────────────────────────────────── */

function Cs2RadarCard({
  game,
  spotifyLine,
  compact,
  prefersReduced,
}: {
  game: Activity;
  spotifyLine?: ActivitySpotify | null;
  compact: boolean;
  prefersReduced: boolean | null;
}) {
  const { t } = useLanguage();
  const { ingame, inAgents, matchData, hasScore, mode, map, start, elapsed } = useMatchCardState(game, prefersReduced);

  return (
    <motion.div
      initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={prefersReduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      className={`match-card radar-card${compact ? ' is-compact' : ''}${ingame ? '' : ' standby'}`}
      data-variant={game.matchData?.gameId || 'cs2'}
      style={{ '--mc-accent': '#e8963c', '--mc-user-accent': 'var(--user-accent, #35e0ff)' } as React.CSSProperties}
    >
      <div className="radar-wrap">
        <div className="radar-data">
          <p className="radar-game" title={game.name}>{game.name}</p>

          {/* Map — only when real (hidden in lobby: name already above). */}
          {(ingame || inAgents) && map && <p className="radar-map">{map}</p>}
          {(ingame || inAgents) && mode && <p className="radar-mode">{mode}</p>}

          {/* Score — ONLY when the real numbers arrived. */}
          {hasScore ? (
            <div className="radar-score">
              <span className="n ct">{matchData!.scoreYou}</span>
              <span className="sep">—</span>
              <span className="n tt">{matchData!.scoreThem}</span>
              <span className="radar-score-side">
                <span className="tags"><span className="tg ct">CT</span><span className="tg tt">T</span></span>
                {typeof matchData!.round === 'number' && (
                  <span className="radar-round">{t('matchcard_round').replace('{n}', String(matchData!.round))}</span>
                )}
              </span>
            </div>
          ) : (
            <div className="radar-status">
              {inAgents ? t('matchcard_agent_select')
                : ingame ? t('matchcard_in_progress') : (
                <>
                  {t('matchcard_playing').replace('{game}', game.name)}
                  <span className="sep-dot"> · </span>
                  {t('matchcard_in_menu')}
                </>
              )}
            </div>
          )}

          {/* Real party size — only when the presence delivered it. */}
          {typeof matchData?.partySize === 'number' && matchData.partySize > 1 && (
            <p className="radar-party">{t('matchcard_party').replace('{n}', String(matchData.partySize))}</p>
          )}

          {/* Live clock — own hairline row, only during a real match. */}
          {ingame && start ? (
            <div className="radar-clockrow">
              <span className="rlbl">{t('matchcard_match_time')}</span>
              <span className="radar-clock">
                <span className="t">
                  {!prefersReduced && <span className="live-dot" aria-hidden />}
                  {formatElapsed(elapsed)}
                </span>
              </span>
            </div>
          ) : null}
        </div>

        {/* THE RADAR — the identity of the card (standby when lobby). */}
        <div className="radar-scope" aria-hidden>
          <div className="radar-disc" />
          <div className="radar-sweep" />
          <span className="radar-blip b1" />
          <span className="radar-blip b2" />
          <span className="radar-blip b3" />
        </div>
      </div>

      <span className="radar-stamp">CS2</span>

      {/* party + Spotify fine line — real data only; party source pending. */}
      {spotifyLine && (
        <div className="match-card-song">
          <span className="note" aria-hidden>♪</span>
          <span className="name" title={`${spotifyLine.song} — ${spotifyLine.artist}`}>
            {spotifyLine.song} — {spotifyLine.artist}
          </span>
        </div>
      )}
    </motion.div>
  );
}

/* ── Default / VALORANT coral card ─────────────────────────────────────── */

function DefaultMatchCard({
  game,
  spotifyLine,
  compact,
  prefersReduced,
  accent,
  gameId,
}: {
  game: Activity;
  spotifyLine?: ActivitySpotify | null;
  compact: boolean;
  prefersReduced: boolean | null;
  accent: string;
  gameId: string;
}) {
  const { t } = useLanguage();
  const { ingame, inAgents, matchData, hasScore, mode, map, start, elapsed } = useMatchCardState(game, prefersReduced);
  const hasModeLine = Boolean(mode || map);

  return (
    <motion.div
      initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={prefersReduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      className={`match-card${compact ? ' is-compact' : ''}`}
      style={{ '--mc-accent': accent, '--mc-user-accent': 'var(--user-accent, #35e0ff)' } as React.CSSProperties}
    >
      <div className="match-card-glow" aria-hidden />

      <div className="match-card-body">
        {/* Game icon article (VERTEX-original glyph, breathing glow). */}
        <div className="match-card-icon" aria-hidden>
          <svg viewBox="0 0 96 96">
            <rect width="96" height="96" rx="18" className="mc-icon-bg" />
            {gameId === 'cs2' ? (
              <></>
            ) : (
              <>
                <polygon points="48,14 78,48 48,82 18,48" fill="none" className="mc-icon-frame" strokeWidth="3" />
                <polygon points="48,30 66,48 48,66 30,48" className="mc-icon-fill" />
                <polygon points="48,40 56,48 48,56 40,48" className="mc-icon-core" />
              </>
            )}
          </svg>
        </div>

        <div className="match-card-main">
          <p className="match-card-game" title={game.name}>{game.name}</p>

          {hasModeLine ? (
            <p className="match-card-mode">
              {mode && <b>{mode}</b>}
              {mode && map ? ' · ' : ''}
              {map}
            </p>
          ) : (
            <p className="match-card-mode">
              {ingame ? t('matchcard_in_progress') : t('matchcard_playing').replace('{game}', game.name)}
            </p>
          )}

          <div className="match-card-score-row">
            {/* Score — ONLY when the real numbers arrived. */}
            {hasScore && (
              <div className="match-card-score" data-game={gameId}>
                <span className="n you">{matchData!.scoreYou}</span>
                <span className="sep">—</span>
                <span className="n them">{matchData!.scoreThem}</span>
                {typeof matchData!.round === 'number' && (
                  <span className="round">{t('matchcard_round').replace('{n}', String(matchData!.round))}</span>
                )}
              </div>
            )}
            <div className="match-card-timer">
              <span className="t">
                {ingame && start && !prefersReduced && <span className="live-dot" aria-hidden />}
                {ingame && start ? formatElapsed(elapsed) : ingame ? t('matchcard_in_progress') : t('matchcard_in_menu')}
              </span>
              {ingame && !compact && !hasScore && <span className="cap">{t('matchcard_match_time')}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Spotify as a fine secondary line — only when music plays too. */}
      {spotifyLine && (
        <div className="match-card-song">
          <span className="note" aria-hidden>♪</span>
          <span className="name" title={`${spotifyLine.song} — ${spotifyLine.artist}`}>
            {spotifyLine.song} — {spotifyLine.artist}
          </span>
        </div>
      )}
    </motion.div>
  );
}

export function MatchCard({
  game,
  spotifyLine,
  compact = false,
}: {
  /** The detected game activity (type 'playing' or 'streaming'). */
  game: Activity;
  /** Spotify snapshot playing at the same time, or null. */
  spotifyLine?: ActivitySpotify | null;
  /** Compact variant (popout). */
  compact?: boolean;
}) {
  const prefersReduced = useReducedMotion();
  const gameId = game.matchData?.gameId ?? '';

  // CS2 gets its own radar composition; every other game the coral card.
  if (gameId === 'cs2') {
    return <Cs2RadarCard game={game} spotifyLine={spotifyLine} compact={compact} prefersReduced={prefersReduced} />;
  }
  const accent = GAME_ACCENTS[gameId] ?? '#ff4655';
  return (
    <DefaultMatchCard
      game={game}
      spotifyLine={spotifyLine}
      compact={compact}
      prefersReduced={prefersReduced}
      accent={accent}
      gameId={gameId}
    />
  );
}

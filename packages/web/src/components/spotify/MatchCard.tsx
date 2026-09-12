import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useLanguage } from '../../contexts/LanguageContext';
import type { Activity, ActivitySpotify } from '@backspace/shared';

/**
 * MATCH CARD — the "playing a game" state of the profile music widget.
 *
 * When the user's primary activity is a detected GAME, the widget renders
 * this card instead of the music box: game icon with breathing glow, big
 * game name, and ONLY the data that actually arrived:
 *  - Riot (VALORANT): 'ingame'/'menu' in `state`, "Mode · Map" in `details`.
 *  - CS2: real map/score/round via `matchData` (GSI-style local source);
 *    score row + round + map render only when those numbers exist.
 *  - Bare process detection → "Jugando a <game>" / "En menú". Nothing invented.
 *
 * Per-game accent: cs2 → arena orange, valorant → coral (VERTEX palettes).
 *
 * Reduced motion: no entry animation, static glow, frozen timer.
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
  cs2: '#de9b35',      // arena orange
  valorant: '#ff4655', // coral
};

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
  const { t } = useLanguage();
  const prefersReduced = useReducedMotion();

  // HONESTY RULE: the process running only proves the game is open.
  // Real match state comes from the enriched payload: the desktop pipeline
  // puts 'ingame' | 'menu' in `state` (Riot lockfile local API) and packs the
  // REAL mode/map as "Mode · Map" into `details`. Without that enrichment we
  // only know the process runs → "Jugando a <game>", never a fake match.
  const rawState = game.state?.trim() ?? '';
  const matchState = rawState === 'ingame' || rawState === 'menu'
    ? rawState
    : null;
  const ingame = matchState === 'ingame';

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

  const hasModeLine = Boolean(mode || map);

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

  // Game accent: per-game VERTEX palette; coral default.
  const gameId = matchData?.gameId ?? '';
  const accent = GAME_ACCENTS[gameId] ?? '#ff4655';

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
              // CS2 glyph: crosshair target — VERTEX original, no game logos.
              <>
                <circle cx="48" cy="48" r="26" fill="none" className="mc-icon-frame" strokeWidth="3" />
                <circle cx="48" cy="48" r="10" className="mc-icon-fill" />
                <rect x="45.5" y="12" width="5" height="16" className="mc-icon-core" />
                <rect x="45.5" y="68" width="5" height="16" className="mc-icon-core" />
                <rect x="12" y="45.5" width="16" height="5" className="mc-icon-core" />
                <rect x="68" y="45.5" width="16" height="5" className="mc-icon-core" />
              </>
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
            {/* CS2 score + round — ONLY when the real numbers arrived. */}
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

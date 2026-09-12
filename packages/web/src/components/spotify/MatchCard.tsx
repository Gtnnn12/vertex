import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useLanguage } from '../../contexts/LanguageContext';
import type { Activity, ActivitySpotify } from '@backspace/shared';

/**
 * MATCH CARD — the "playing a game" state of the profile music widget.
 *
 * When the user's primary activity is a detected GAME, the widget renders
 * this card instead of the music box: game icon with breathing glow, big
 * game name, mode/map when the activity carries them (details/state —
 * NEVER invented), live match timer from `timestamps.start`, and the
 * Spotify track as a fine secondary line when music is playing at the
 * same time. Score and party rows only render with real data (there is
 * no score/party source yet, so they simply never render — honest
 * placeholders by omission).
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

  // details = mode, state = map when the activity carries them. The activity
  // pipeline may also pack "Mode · Map" into details — split on the middle
  // dot in that case. Anything missing degrades to "Partida en curso".
  const rawDetails = game.details?.trim() ?? '';
  const rawState = game.state?.trim() ?? '';
  let mode = rawDetails;
  let map = rawState;
  if (rawDetails.includes('·') && !rawState) {
    const [a, ...rest] = rawDetails.split('·');
    mode = a.trim();
    map = rest.join('·').trim();
  } else if (rawDetails && !rawState) {
    map = '';
  }

  const hasModeLine = Boolean(mode || map);

  // HONESTY RULE: the process running only proves the game is open.
  // A real match exists ONLY when the enriched payload says so:
  //  - matchState === 'ingame' (lockfile/local API: real session), or
  //  - a real match start timestamp distinct from the app launch, or
  //  - real map/mode data arrived.
  // Otherwise we are at best in a menu/lobby → "Jugando a <game>".
  const matchState = game.state === 'ingame' || game.details === 'ingame' ? 'ingame'
    : game.state === 'menu' || game.details === 'menu' ? 'menu'
    : null;
  const ingame = matchState === 'ingame';

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

  // Game accent: coral default; activities may carry a per-game accent later
  // via assets.smallText — not invented when absent.
  const accent = '#ff4655';

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
            <polygon points="48,14 78,48 48,82 18,48" fill="none" className="mc-icon-frame" strokeWidth="3" />
            <polygon points="48,30 66,48 48,66 30,48" className="mc-icon-fill" />
            <polygon points="48,40 56,48 48,56 40,48" className="mc-icon-core" />
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
            {/* Score: only when real data exists (no source yet — never invented). */}
            <div className="match-card-timer">
              <span className="t">
                {ingame && start && !prefersReduced && <span className="live-dot" aria-hidden />}
                {ingame && start ? formatElapsed(elapsed) : ingame ? t('matchcard_in_progress') : t('matchcard_in_menu')}
              </span>
              {ingame && !compact && <span className="cap">{t('matchcard_match_time')}</span>}
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

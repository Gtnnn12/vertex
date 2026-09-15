import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useLanguage } from '../../contexts/LanguageContext';
import type { Activity } from '@vertex/shared';

/**
 * MATCH CARD — the "playing a game" state of the profile music widget.
 *
 * MINIMAL BY DESIGN (product decision): every surface — popout, board,
 * modal — shows ONLY the game icon + "Jugando a {game}". No mode, no map,
 * no score, no round, no timer: live match detail was noisy and half the
 * time stale. If music plays at the same time, the compact popout offers
 * it on hover (see SpotifyVinylBlock), not on this card.
 *
 * Reduced motion: no entry animation.
 */

/** Per-game accent colours (VERTEX-original palettes). */
const GAME_ACCENTS: Record<string, string> = {
  cs2: '#e8963c',      // tactical orange
  valorant: '#ff4655', // coral
};

export function MatchCard({
  game,
  compact = false,
}: {
  /** The detected game activity (type 'playing' or 'streaming'). */
  game: Activity;
  /** Compact variant (popout). */
  compact?: boolean;
}) {
  const prefersReduced = useReducedMotion();
  const { t } = useLanguage();
  const gameId = game.matchData?.gameId ?? '';
  const accent = GAME_ACCENTS[gameId] ?? '#ff4655';

  return (
    <motion.div
      initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={prefersReduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      className={`match-card is-minimal${compact ? ' is-compact' : ''}`}
      style={{ '--mc-accent': accent } as React.CSSProperties}
      title={game.name}
    >
      <div className="match-card-body">
        {/* Game icon article (VERTEX-original glyph). */}
        <div className="match-card-icon" aria-hidden>
          <svg viewBox="0 0 96 96">
            <rect width="96" height="96" rx="18" className="mc-icon-bg" />
            <polygon points="48,14 78,48 48,82 18,48" fill="none" className="mc-icon-frame" strokeWidth="3" />
            <polygon points="48,30 66,48 48,66 30,48" className="mc-icon-fill" />
            <polygon points="48,40 56,48 48,56 40,48" className="mc-icon-core" />
          </svg>
        </div>

        <div className="match-card-main">
          <p className="match-card-game">{t('matchcard_playing').replace('{game}', game.name)}</p>
        </div>
      </div>
    </motion.div>
  );
}

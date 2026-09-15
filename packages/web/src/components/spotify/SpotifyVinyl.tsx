import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useLanguage } from '../../contexts/LanguageContext';
import type { ActivitySpotify } from '@vertex/shared';
import { useDominantColor } from '../../spotify/useDominantColor';
import { MusicDisc } from '../../spotify/MusicDisc';
import type { MusicStyleId } from '../../spotify/musicStyles';

/**
 * The VERTEX Spotify card — Discord's data, our own visual language.
 *
 * ONE shared card shell: header (live badge + glyph), track texts, real-time
 * times, hairline progress bar, ambient glow and entry animation. The "disc"
 * visual is a pluggable VARIANT rendered by <MusicDisc style={…}/> — the
 * data-driven music-widget style registry (musicStyles.ts). The free default
 * ('vinyl', the original turntable) is pixel-identical to the pre-registry
 * card; every other style is a Netrex entitlement checked by the SERVER.
 *
 * Paused → rotors stop and the live dot disappears. Hover “scratches” the
 * vinyl (brief speed-up). Clicking opens the track's search on Spotify (works
 * for free and premium). Everything respects prefers-reduced-motion.
 */

/** “01:24” — minutes zero-padded, per the VERTEX times spec. */
function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function SpotifyCard({
  spotify,
  compact = false,
  style: musicStyle = 'vinyl',
}: {
  spotify: ActivitySpotify;
  compact?: boolean;
  /** Music-widget style id — drives ONLY the disc visual (MusicDisc). */
  style?: MusicStyleId;
}) {
  const { t } = useLanguage();
  const prefersReduced = useReducedMotion();
  const dominant = useDominantColor(spotify.albumCover);
  // Fallback glow: Spotify green → reads “alive” even before canvas returns.
  const glow = dominant ?? '#1DB954';

  // Real-time progress: extrapolate from the server snapshot.
  const startRef = useRef(Date.now());
  const baseRef = useRef(spotify.progressMs);
  useEffect(() => {
    baseRef.current = spotify.progressMs;
    startRef.current = Date.now();
  }, [spotify.progressMs, spotify.fetchedAt, spotify.song]);

  const [progress, setProgress] = useState(spotify.progressMs);
  useEffect(() => {
    if (prefersReduced || !spotify.isPlaying) {
      setProgress(spotify.progressMs);
      return;
    }
    const id = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      setProgress(Math.min(baseRef.current + elapsed, spotify.durationMs));
    }, 1000);
    return () => clearInterval(id);
  }, [prefersReduced, spotify.isPlaying, spotify.durationMs, spotify.song, spotify.progressMs]);

  const hasRealProgress = spotify.durationMs > 0 && spotify.progressMs >= 0;
  const pct = hasRealProgress ? Math.min(100, (progress / spotify.durationMs) * 100) : 0;

  const searchUrl = useMemo(
    () => `https://open.spotify.com/search/${encodeURIComponent(`${spotify.song} ${spotify.artist}`)}`,
    [spotify.song, spotify.artist],
  );

  return (
    <motion.a
      href={searchUrl}
      target="_blank"
      rel="noreferrer noopener"
      title={t('spotify_open_in_spotify')}
      initial={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
      animate={prefersReduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      className={`spotify-card${spotify.isPlaying ? '' : ' is-paused'}${compact ? ' is-compact' : ''}`}
      style={{ '--vinyl-glow': glow } as React.CSSProperties}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Ambient glow — static layer, only opacity changes. Clamped so it never blows out. */}
      <div aria-hidden className="spotify-card-ambient" />

      {/* ── Header: live badge ── */}
      <div className="spotify-card-header">
        {spotify.isPlaying && <span aria-hidden className="spotify-live-dot" />}
        <SpotifyGlyph className="h-3.5 w-3.5 flex-shrink-0 text-[#1DB954]" />
        <span className="spotify-card-badge">
          {spotify.isPlaying ? t('spotify_listening_badge') : t('spotify_badge_idle')}
        </span>
        <VolumeGlyph className="ml-auto h-3 w-3 flex-shrink-0 text-white/30" />
      </div>

      <div className="spotify-card-body">
        {/* ── The style disc — the ONLY thing that changes between styles ── */}
        <MusicDisc style={musicStyle} spotify={spotify} glow={glow} compact={compact} />

        {/* ── Track info ── */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-semibold leading-snug text-white" title={spotify.song}>
            {spotify.song}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-white/55" title={spotify.artist}>
            {spotify.artist}
          </p>

          {/* Times — only with real progress data (gracefully hidden otherwise). */}
          {hasRealProgress && (
            <>
              <div className="spotify-card-times">
                {formatMs(progress)} <span className="text-white/25">—</span> {formatMs(spotify.durationMs)}
              </div>
              {/* Hairline progress bar */}
              <div className="mt-1 h-px w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full spotify-progress-fill"
                  style={{ width: `${pct}%`, background: glow }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </motion.a>
  );
}

/** Back-compat alias: the free vinyl card, exactly the original behaviour. */
export function SpotifyVinyl({ spotify, compact = false }: { spotify: ActivitySpotify; compact?: boolean }) {
  return <SpotifyCard spotify={spotify} compact={compact} style="vinyl" />;
}

/** Compact row variant for activity panels: mini cover + “song — artist”. */
export function SpotifyMiniRow({ spotify }: { spotify: ActivitySpotify }) {
  return (
    <div className="flex items-center gap-2">
      {spotify.albumCover ? (
        <img
          src={spotify.albumCover}
          alt=""
          className="h-6 w-6 rounded object-cover"
          draggable={false}
        />
      ) : (
        <SpotifyGlyph className="h-4 w-4 text-[#1DB954]" />
      )}
      <span className="min-w-0 truncate text-[12px] text-white/70">
        <span className="text-white/85">{spotify.song}</span>
        <span className="text-white/40"> — {spotify.artist}</span>
      </span>
      {!spotify.isPlaying && (
        <span className="ml-auto flex-shrink-0 font-mono text-[9px] uppercase text-white/35">
          ⏸
        </span>
      )}
    </div>
  );
}

export function SpotifyGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.5 17.28a.75.75 0 0 1-1.03.25c-2.83-1.73-6.39-2.12-10.59-1.16a.75.75 0 1 1-.33-1.46c4.56-1.04 8.48-.59 11.64 1.34.36.21.47.67.31 1.03zm1.47-3.27a.94.94 0 0 1-1.29.31c-3.24-1.99-8.17-2.57-12-1.41a.94.94 0 1 1-.54-1.79c4.38-1.33 9.82-.68 13.55 1.6.44.27.58.85.28 1.29zm.13-3.4C15.24 8.33 8.82 8.12 5.09 9.25a1.12 1.12 0 1 1-.65-2.15c4.28-1.3 11.4-1.05 15.89 1.62a1.12 1.12 0 0 1-1.15 1.93z" />
    </svg>
  );
}

function VolumeGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

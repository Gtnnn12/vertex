import React, { useRef } from 'react';
import type { ActivitySpotify } from '@backspace/shared';
import type { MusicStyleId } from './musicStyles';

/**
 * The style-specific "disc" visual of the music card. One component, eight
 * variants — driven by the registry id. Everything shares the card shell
 * (header/texts/times) rendered by SpotifyCard; ONLY this visual changes.
 *
 * STRUCTURE: every variant renders inside a dedicated square stage
 * (.spotify-music-disc, width/height = disc size, position:relative). The
 * variant visuals are absolute inset-0 — bounded by the STAGE, never by the
 * card. Without the stage they would stretch across the whole card body.
 *
 * Animation contract (VERTEX motion spec): transform/opacity only; the rotor
 * animations (reels, CD, orbits) are the sanctioned linear exceptions;
 * everything else eases with cubic-bezier. CSS lives in styles/musicStyles.css.
 */

/** Spectrum bar heights — precomputed per render, springs via CSS transition. */
function spectrumScales(seed: number, playing: boolean): number[] {
  const scales: number[] = [];
  for (let i = 0; i < 14; i++) {
    if (!playing) {
      scales.push(0.18 + ((i * 7 + seed) % 5) * 0.04);
      continue;
    }
    const wave = Math.sin((i / 13) * Math.PI);
    const jitter = ((i * 37 + seed * 13) % 17) / 17;
    scales.push(0.22 + wave * (0.45 + jitter * 0.33));
  }
  return scales;
}

/**
 * Cover or the shared no-cover fallback. Every variant renders a SQUARE chip
 * (logo on dark) so the fallback never stretches: `fit="fill"` covers the
 * whole parent (chip/label/cover frames), `fit="square"` keeps an
 * aspect-ratio square (cassette label art strip).
 */
function CoverImg({
  spotify,
  fit = 'fill',
}: {
  spotify: ActivitySpotify;
  fit?: 'fill' | 'square';
}): React.ReactElement {
  const sizing = fit === 'fill' ? 'h-full w-full' : 'h-full w-auto aspect-square shrink-0';
  return (
    <span className={`block overflow-hidden bg-[#0d0d0d] ${sizing}`} aria-hidden>
      {spotify.albumCover ? (
        <img src={spotify.albumCover} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <img src="/icons/logo-mark.svg" alt="VERTEX" className="h-1/2 w-1/2 opacity-80" draggable={false} />
        </span>
      )}
    </span>
  );
}

export function MusicDisc({
  style,
  spotify,
  glow,
  compact,
}: {
  style: MusicStyleId;
  spotify: ActivitySpotify;
  glow: string;
  compact: boolean;
}): React.ReactElement {
  const playing = spotify.isPlaying;
  const size = compact ? 76 : 96;

  return (
    <div
      className="spotify-music-disc"
      style={{ width: size, height: size, '--vinyl-glow': glow } as React.CSSProperties}
    >
      {style === 'cassette' && <CassetteVisual spotify={spotify} playing={playing} />}
      {style === 'holographic-cd' && <HoloVisual spotify={spotify} playing={playing} />}
      {style === 'crystal-orbit' && <CrystalVisual spotify={spotify} playing={playing} />}
      {style === 'spectrum' && <SpectrumVisual spotify={spotify} glow={glow} playing={playing} />}
      {style === 'boombox' && <BoomboxVisual playing={playing} />}
      {style === 'glass-prism' && <PrismVisual spotify={spotify} />}
      {style === 'arcade' && <ArcadeVisual spotify={spotify} />}
      {(style === 'vinyl' || !style) && <VinylVisual spotify={spotify} playing={playing} />}
    </div>
  );
}

/* ── 1. VINYL — the original turntable, unchanged behaviour ───────────────── */
function VinylVisual({ spotify, playing }: { spotify: ActivitySpotify; playing: boolean }): React.ReactElement {
  return (
    <div className="spotify-vinyl h-full w-full">
      <div
        className={`spotify-disc${playing ? ' spotify-disc-spin' : ''}`}
        style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 2px 8px rgba(0,0,0,0.9), 0 4px 14px -6px rgba(0,0,0,0.8)' }}
      >
        <div
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'repeating-radial-gradient(circle at center, rgba(0,0,0,0.4) 0px, rgba(0,0,0,0.4) 2px, rgba(255,255,255,0.035) 3px, rgba(255,255,255,0.035) 4px)',
          }}
        />
        {spotify.albumCover ? (
          <img
            src={spotify.albumCover}
            alt={spotify.albumName ?? spotify.song}
            className="absolute inset-[21%] h-[58%] w-[58%] rounded-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-[21%] flex h-[58%] w-[58%] items-center justify-center rounded-full bg-white/[0.08] ring-1 ring-white/10">
            <img src="/icons/logo-mark.svg" alt="VERTEX" className="h-1/2 w-1/2 opacity-80" draggable={false} />
          </div>
        )}
        <div className="absolute left-1/2 top-1/2 h-[8%] w-[8%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#0a0a0a] ring-1 ring-white/25" />
      </div>
      <div aria-hidden className="spotify-vinyl-sheen" />
    </div>
  );
}

/* ── 2. CASSETTE ──────────────────────────────────────────────────────────── */
function CassetteVisual({ spotify, playing }: { spotify: ActivitySpotify; playing: boolean }): React.ReactElement {
  return (
    <div className={`music-cassette${playing ? ' is-playing' : ''}`} role="img" aria-label={spotify.albumName ?? spotify.song}>
      <div className="music-cassette-window" aria-hidden>
        <span className="music-cassette-reel music-cassette-reel--left" />
        <span className="music-cassette-reel music-cassette-reel--right" />
      </div>
      <div className="music-cassette-label" aria-hidden>
        <CoverImg spotify={spotify} fit="square" />
        <span className="music-cassette-label-lines" />
      </div>
    </div>
  );
}

/* ── 3. HOLOGRAPHIC CD ────────────────────────────────────────────────────── */
function HoloVisual({ spotify, playing }: { spotify: ActivitySpotify; playing: boolean }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty('--holo-mx', `${x}%`);
    el.style.setProperty('--holo-my', `${y}%`);
  };

  return (
    <div ref={ref} className={`music-holo${playing ? ' is-playing' : ''}`} onPointerMove={onMove} role="img" aria-label={spotify.albumName ?? spotify.song}>
      <div className="music-holo-tilt">
        <div className="music-holo-cd" aria-hidden>
          <div className="music-holo-label">
            <CoverImg spotify={spotify} />
          </div>
        </div>
        <div className="music-holo-sheen" aria-hidden />
      </div>
    </div>
  );
}

/* ── 4. CRYSTAL ORBITAL ───────────────────────────────────────────────────── */
function CrystalVisual({ spotify, playing }: { spotify: ActivitySpotify; playing: boolean }): React.ReactElement {
  return (
    <div className={`music-crystal${playing ? ' is-playing' : ''}`} role="img" aria-label={spotify.albumName ?? spotify.song}>
      <span className="music-crystal-ring music-crystal-ring--1" aria-hidden />
      <span className="music-crystal-ring music-crystal-ring--2" aria-hidden />
      <span className="music-crystal-ring music-crystal-ring--3" aria-hidden />
      <div className="music-crystal-core" aria-hidden>
        <CoverImg spotify={spotify} />
      </div>
      <span className="music-crystal-spark music-crystal-spark--1" aria-hidden />
      <span className="music-crystal-spark music-crystal-spark--2" aria-hidden />
      <span className="music-crystal-spark music-crystal-spark--3" aria-hidden />
    </div>
  );
}

/* ── 5. AUDIO SPECTRUM ────────────────────────────────────────────────────── */
function SpectrumVisual({ spotify, glow, playing }: { spotify: ActivitySpotify; glow: string; playing: boolean }): React.ReactElement {
  const scales = spectrumScales(3, playing);
  return (
    <div className={`music-spectrum${playing ? ' is-playing' : ''}`} role="img" aria-label={spotify.albumName ?? spotify.song}>
      <div className="music-spectrum-chip" aria-hidden>
        <CoverImg spotify={spotify} />
      </div>
      {scales.map((s, i) => (
        <span
          key={i}
          className={`music-spectrum-bar${i === 0 ? ' music-spectrum-bar--lead' : ''}`}
          style={{
            '--bar-scale': s,
            background: i % 3 === 0 ? glow : `color-mix(in srgb, ${glow} 65%, rgb(255 255 255 / 0.35))`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

/* ── 6. VERTEX BOOMBOX ────────────────────────────────────────────────────── */
function BoomboxVisual({ playing }: { playing: boolean }): React.ReactElement {
  return (
    <div className={`music-boombox${playing ? ' is-playing' : ''}`} aria-hidden>
      <span className="music-boombox-speaker" />
      <span className="music-boombox-deck">
        <span className="music-boombox-cassette" />
        <span className="music-boombox-leds">
          <span className="music-boombox-led" />
          <span className="music-boombox-led" />
          <span className="music-boombox-led" />
          <span className="music-boombox-led" />
        </span>
      </span>
      <span className="music-boombox-speaker" />
    </div>
  );
}

/* ── 7. GLASS PRISM ───────────────────────────────────────────────────────── */
function PrismVisual({ spotify }: { spotify: ActivitySpotify }): React.ReactElement {
  return (
    <div className="music-prism" role="img" aria-label={spotify.albumName ?? spotify.song}>
      <span
        className="music-prism-blur"
        aria-hidden
        style={{ backgroundImage: spotify.albumCover ? `url(${spotify.albumCover})` : 'radial-gradient(circle at 35% 30%, rgba(147,197,253,0.35), rgba(13,13,13,0.9))' }}
      />
      <span className="music-prism-tint" aria-hidden />
      <div className="music-prism-cover" aria-hidden>
        <CoverImg spotify={spotify} />
      </div>
    </div>
  );
}

/* ── 8. ARCADE ────────────────────────────────────────────────────────────── */
function ArcadeVisual({ spotify }: { spotify: ActivitySpotify }): React.ReactElement {
  return (
    <div className="music-arcade music-arcade--premium" role="img" aria-label={spotify.albumName ?? spotify.song}>
      <div className="music-arcade-cover" aria-hidden>
        <CoverImg spotify={spotify} />
      </div>
      <span className="music-arcade-heart" aria-hidden />
      <span className="music-arcade-scanlines" aria-hidden />
    </div>
  );
}

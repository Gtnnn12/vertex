import React from 'react';
import type { ActivitySpotify } from '@backspace/shared';
import type { MusicStyleId } from './musicStyles';

/**
 * The style-specific "disc" visual of the music card. One component — driven
 * by the registry id. Everything shares the card shell (header/texts/times)
 * rendered by SpotifyCard; ONLY this visual changes.
 *
 * STRUCTURE: every variant renders inside a dedicated square stage
 * (.spotify-music-disc, width/height = disc size, position:relative). The
 * variant visuals are absolute inset-0 — bounded by the STAGE, never by the
 * card. Without the stage they would stretch across the whole card body.
 *
 * Animation contract (VERTEX motion spec): transform/opacity only; rotor
 * animations are the sanctioned linear exceptions; everything else eases with
 * cubic-bezier. CSS lives in styles/musicStyles.css.
 *
 * 2026-09 catalog: vinyl (free default) + aurora/pixel-paradise (free) +
 * kawaii-dream/neon-city/holo-room/nihon/sweetie/ink-panic (Netrex).
 */

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
      {style === 'aurora' && <AuroraVisual spotify={spotify} playing={playing} />}
      {style === 'pixel-paradise' && <PixelVisual spotify={spotify} playing={playing} />}
      {style === 'kawaii-dream' && <KawaiiVisual spotify={spotify} playing={playing} />}
      {style === 'neon-city' && <NeonCityVisual spotify={spotify} />}
      {style === 'holo-room' && <HoloRoomVisual spotify={spotify} />}
      {style === 'nihon' && <NihonVisual spotify={spotify} />}
      {style === 'sweetie' && <SweetieVisual spotify={spotify} />}
      {style === 'ink-panic' && <InkPanicVisual spotify={spotify} />}
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

/* ── 9. KAWAII DREAM — cloud frame + floating hearts/stars, pastel glow ───── */
function KawaiiVisual({ spotify, playing }: { spotify: ActivitySpotify; playing: boolean }): React.ReactElement {
  return (
    <div className={`music-kawaii${playing ? ' is-playing' : ''}`} role="img" aria-label={spotify.albumName ?? spotify.song}>
      {/* Floating charms — decorative, aria-hidden, transform/opacity only. */}
      <span className="music-kawaii-heart h1" aria-hidden>♥</span>
      <span className="music-kawaii-heart h2" aria-hidden>♥</span>
      <span className="music-kawaii-star s1" aria-hidden>✦</span>
      <span className="music-kawaii-star s2" aria-hidden>✧</span>
      {/* Cloud-shaped cover frame (lace scallops live in CSS). */}
      <div className="music-kawaii-cloud" aria-hidden>
        <div className="music-kawaii-cover">
          <CoverImg spotify={spotify} />
        </div>
      </div>
    </div>
  );
}
/* ── 2. AURORA — night sky, drifting ribbons, floating cover, cold glow ─── */
function AuroraVisual({ spotify, playing }: { spotify: ActivitySpotify; playing: boolean }): React.ReactElement {
  return (
    <div className={`music-aurora${playing ? ' is-playing' : ''}`} role="img" aria-label={spotify.albumName ?? spotify.song}>
      <span className="music-aurora-ribbon r1" aria-hidden />
      <span className="music-aurora-ribbon r2" aria-hidden />
      <span className="music-aurora-ribbon r3" aria-hidden />
      <span className="music-aurora-star s1" aria-hidden />
      <span className="music-aurora-star s2" aria-hidden />
      <span className="music-aurora-star s3" aria-hidden />
      <div className="music-aurora-cover" aria-hidden>
        <CoverImg spotify={spotify} />
      </div>
      <span className="music-aurora-ridge" aria-hidden />
    </div>
  );
}

/* ── 3. PIXEL PARADISE — 8-bit island scene, sun, clouds, waves ─────────── */
function PixelVisual({ spotify, playing }: { spotify: ActivitySpotify; playing: boolean }): React.ReactElement {
  return (
    <div className={`music-pixel${playing ? ' is-playing' : ''}`} role="img" aria-label={spotify.albumName ?? spotify.song}>
      <span className="music-pixel-sun" aria-hidden />
      <span className="music-pixel-cloud c1" aria-hidden />
      <span className="music-pixel-cloud c2" aria-hidden />
      <div className="music-pixel-window" aria-hidden>
        <div className="music-pixel-cover">
          <CoverImg spotify={spotify} />
        </div>
      </div>
      <span className="music-pixel-wave w1" aria-hidden />
      <span className="music-pixel-wave w2" aria-hidden />
      <span className="music-pixel-wave w3" aria-hidden />
    </div>
  );
}

/* ── 4. NEON CITY — night skyline, cover as a glowing billboard ─────────── */
function NeonCityVisual({ spotify }: { spotify: ActivitySpotify }): React.ReactElement {
  return (
    <div className="music-neon" role="img" aria-label={spotify.albumName ?? spotify.song}>
      <span className="music-neon-skyline" aria-hidden />
      <span className="music-neon-sign sign-pink" aria-hidden>V</span>
      <span className="music-neon-sign sign-cyan" aria-hidden>X</span>
      <div className="music-neon-billboard" aria-hidden>
        <CoverImg spotify={spotify} />
      </div>
      <span className="music-neon-asphalt" aria-hidden />
    </div>
  );
}

/* ── 5. HOLO ROOM — projected hologram: scanlines, beam, emitter base ───── */
function HoloRoomVisual({ spotify }: { spotify: ActivitySpotify }): React.ReactElement {
  return (
    <div className="music-holoroom" role="img" aria-label={spotify.albumName ?? spotify.song}>
      <span className="music-holoroom-beam" aria-hidden />
      <div className="music-holoroom-ghost" aria-hidden>
        <CoverImg spotify={spotify} />
      </div>
      <span className="music-holoroom-base" aria-hidden />
    </div>
  );
}

/* ── 6. NIHON — kakemono scroll, hanko, sakura petals ───────────────────── */
function NihonVisual({ spotify }: { spotify: ActivitySpotify }): React.ReactElement {
  return (
    <div className="music-nihon" role="img" aria-label={spotify.albumName ?? spotify.song}>
      <span className="music-nihon-rod rod-top" aria-hidden />
      <div className="music-nihon-scroll" aria-hidden>
        <div className="music-nihon-mount">
          <CoverImg spotify={spotify} />
        </div>
      </div>
      <span className="music-nihon-rod rod-bottom" aria-hidden />
      <span className="music-nihon-hanko" aria-hidden>VE</span>
      <span className="music-nihon-petal p1" aria-hidden>❀</span>
      <span className="music-nihon-petal p2" aria-hidden>❀</span>
      <span className="music-nihon-cloud" aria-hidden />
    </div>
  );
}

/* ── 7. SWEETIE — candy frame, bow, bubbles, sparks ──────────────────────── */
function SweetieVisual({ spotify }: { spotify: ActivitySpotify }): React.ReactElement {
  return (
    <div className="music-sweetie" role="img" aria-label={spotify.albumName ?? spotify.song}>
      <span className="music-sweetie-stripe" aria-hidden />
      <span className="music-sweetie-bow" aria-hidden />
      <div className="music-sweetie-cookie" aria-hidden>
        <CoverImg spotify={spotify} />
      </div>
      <span className="music-sweetie-bubble b1" aria-hidden />
      <span className="music-sweetie-bubble b2" aria-hidden />
      <span className="music-sweetie-heart" aria-hidden>♥</span>
    </div>
  );
}

/* ── 8. INK PANIC — manga panel: halftone, burst, speed lines ────────────── */
function InkPanicVisual({ spotify }: { spotify: ActivitySpotify }): React.ReactElement {
  return (
    <div className="music-ink" role="img" aria-label={spotify.albumName ?? spotify.song}>
      <span className="music-ink-halftone" aria-hidden />
      <span className="music-ink-burst" aria-hidden />
      <span className="music-ink-note" aria-hidden>♪</span>
      <div className="music-ink-panel" aria-hidden>
        <CoverImg spotify={spotify} />
      </div>
      <span className="music-ink-speed sp1" aria-hidden />
      <span className="music-ink-speed sp2" aria-hidden />
      <span className="music-ink-speed sp3" aria-hidden />
    </div>
  );
}

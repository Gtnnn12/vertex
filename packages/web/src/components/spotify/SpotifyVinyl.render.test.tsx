import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { SpotifyCard } from './SpotifyVinyl';

/** Drain framer-motion's entry animation so the body renders. */
async function renderSettled(ui: React.ReactElement) {
  const utils = render(ui);
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  return utils;
}

describe('SpotifyCard render regression (empty-card bug)', () => {
  it('renders vinyl + song + artist with a full payload', async () => {
    const { container } = await renderSettled(
      <SpotifyCard
        spotify={{
          song: 'CARITA FELIZ', artist: 'Myke Towers', albumName: undefined,
          albumCover: '', progressMs: 0, durationMs: 0, isPlaying: true, fetchedAt: 1,
        }}
        style="vinyl"
      />,
    );
    console.log('BODY-HTML:', container.querySelector('.spotify-card-body')?.innerHTML?.slice(0, 800));
    console.log('HAS-DISC:', !!container.querySelector('.spotify-disc'));
    console.log('HAS-VINYL:', !!container.querySelector('.spotify-vinyl'));
    expect(container.querySelector('.spotify-disc')).not.toBeNull();
    expect(container.textContent).toContain('CARITA FELIZ');
    expect(container.textContent).toContain('Myke Towers');
  });

  it('renders compact card body with an empty payload (no cover, no artist)', async () => {
    const { container } = await renderSettled(
      <SpotifyCard
        spotify={{
          song: 'Spotify', artist: '', albumName: undefined,
          albumCover: '', progressMs: 0, durationMs: 0, isPlaying: true, fetchedAt: 1,
        }}
        compact
        style="vinyl"
      />,
    );
    expect(container.querySelector('.spotify-disc')).not.toBeNull();
    expect(container.querySelector('.spotify-card-body')).not.toBeNull();
  });
});

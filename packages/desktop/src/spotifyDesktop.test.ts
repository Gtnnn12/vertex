import { describe, it, expect } from 'vitest';
import { parseSpotifyWindowTitle } from './spotifyDesktop';

/**
 * Order is LIVE-CONFIRMED from the user's Windows machine (es-ES desktop,
 * `tasklist /v`): "Artist - Song" — e.g. "Omar Courtz - Comernos".
 */
describe('parseSpotifyWindowTitle', () => {
  it('parses the live-confirmed "Artist - Song" order', () => {
    expect(parseSpotifyWindowTitle('Omar Courtz - Comernos')).toEqual({
      song: 'Comernos',
      artist: 'Omar Courtz',
    });
    expect(parseSpotifyWindowTitle('Myke Towers - CARITA FELIZ')).toEqual({
      song: 'CARITA FELIZ',
      artist: 'Myke Towers',
    });
  });

  it('parses em-dash and pipe separators with the same order', () => {
    expect(parseSpotifyWindowTitle('The Weeknd — Blinding Lights')).toEqual({
      song: 'Blinding Lights',
      artist: 'The Weeknd',
    });
    expect(parseSpotifyWindowTitle('Dua Lipa | Levitating')).toEqual({
      song: 'Levitating',
      artist: 'Dua Lipa',
    });
  });

  it('strips "Spotify Premium" suffix before parsing', () => {
    expect(parseSpotifyWindowTitle('Myke Towers - CARITA FELIZ - Spotify Premium')).toEqual({
      song: 'CARITA FELIZ',
      artist: 'Myke Towers',
    });
  });

  it('filters the Spanish "N/D" placeholder on helper windows', () => {
    expect(parseSpotifyWindowTitle('N/D')).toBeNull();
    expect(parseSpotifyWindowTitle('N/A')).toBeNull();
    expect(parseSpotifyWindowTitle('n/d')).toBeNull();
  });

  it('PLAN B: separator-less title becomes the song with the app name as artist', () => {
    expect(parseSpotifyWindowTitle('Comernos')).toEqual({
      song: 'Comernos',
      artist: 'Spotify',
    });
  });

  it('returns null for the bare app name and blank input', () => {
    expect(parseSpotifyWindowTitle('Spotify')).toBeNull();
    expect(parseSpotifyWindowTitle('Spotify Free')).toBeNull();
    expect(parseSpotifyWindowTitle('Spotify Premium')).toBeNull();
    expect(parseSpotifyWindowTitle(null)).toBeNull();
    expect(parseSpotifyWindowTitle('')).toBeNull();
  });
});

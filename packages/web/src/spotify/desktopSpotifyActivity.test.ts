import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Activity, ActivitySpotify } from '@vertex/shared';
import {
  desktopSpotifyToRichActivity,
  resolveCoverForDesktopSpotify,
} from './desktopSpotifyActivity';

// authStore is read for the cover-search Authorization header — stub it.
vi.mock('../stores/authStore', () => ({
  useAuthStore: { getState: () => ({ token: 'tok-123' }) },
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('desktop Spotify promotion (Vía A)', () => {
  it('promotes listening+payload to the rich spotify shape', () => {
    const input = {
      type: 'listening',
      name: 'Spotify',
      spotify: { song: 'La Cancion', artist: 'El Artista', albumCover: 'https://i.scdn.co/x.jpg' },
    } as unknown as Activity;

    const out = desktopSpotifyToRichActivity(input);
    expect(out.type).toBe('spotify');
    expect((out as { spotify?: ActivitySpotify }).spotify?.song).toBe('La Cancion');
    expect((out as { spotify?: ActivitySpotify }).spotify?.artist).toBe('El Artista');
    expect((out as { spotify?: ActivitySpotify }).spotify?.isPlaying).toBe(true);
  });

  it('leaves generic activities untouched', () => {
    const generic: Activity = { type: 'listening', name: 'Spotify' };
    expect(desktopSpotifyToRichActivity(generic)).toBe(generic);
  });

  it('fetches a missing cover WITH the auth header; failure keeps generic vinyl', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ url: 'https://i.scdn.co/found.jpg' }), { status: 200 }));

    const spotify: ActivitySpotify = {
      song: 'Track B', artist: 'Artist B', albumName: undefined,
      albumCover: '', progressMs: 0, durationMs: 0, isPlaying: true, fetchedAt: 1,
    };
    const out = await resolveCoverForDesktopSpotify(spotify);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/api/spotify/search-cover');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
    expect(out.spotify?.albumCover).toBe('https://i.scdn.co/found.jpg');

    // Failure path (cache stores the negative) — new track key each time.
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    const fail = await resolveCoverForDesktopSpotify({ ...spotify, song: 'Track C' });
    expect(fail.spotify?.albumCover).toBe('');
  });
});

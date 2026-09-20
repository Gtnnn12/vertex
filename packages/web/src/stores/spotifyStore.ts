import { create } from 'zustand';
import { useAuthStore } from './authStore';

/** Raw fetch against the backend with the session token (spotify endpoints). */
async function spotifyFetch<T>(path: string, method = 'GET'): Promise<T> {
  const token = useAuthStore.getState().token;
  const res = await fetch(`/api${path}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`http_${res.status}`);
  return (await res.json()) as T;
}

export interface SpotifyStatus {
  connected: boolean;
  spotifyUser: string | null;
}

interface SpotifyState {
  connected: boolean;
  spotifyUser: string | null;
  loaded: boolean;
  refresh: () => Promise<void>;
  disconnect: () => Promise<void>;
}

/**
 * Spotify connection state for the settings UI and the profile "Connect"
 * button. The listening-now activity itself arrives through the regular
 * activity/presence pipeline (activityStore), not through this store.
 */
export const useSpotifyStore = create<SpotifyState>()((set) => ({
  connected: false,
  spotifyUser: null,
  loaded: false,
  refresh: async () => {
    try {
      const status = await spotifyFetch<SpotifyStatus>('/spotify/status');
      set({ connected: status.connected, spotifyUser: status.spotifyUser, loaded: true });
    } catch {
      set({ connected: false, loaded: true });
    }
  },
  disconnect: async () => {
    try {
      await spotifyFetch('/spotify/disconnect', 'POST');
    } finally {
      set({ connected: false, spotifyUser: null });
    }
  },
}));

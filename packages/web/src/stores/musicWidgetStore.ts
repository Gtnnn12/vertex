import { create } from 'zustand';
import { api } from '../api/client';
import { useAuthStore } from './authStore';
import {
  isMusicStyleId,
  resolveMusicStyle,
  type MusicStyleId,
} from '../spotify/musicStyles';
import type { User } from '@vertex/shared';

/**
 * Client state for the user's music-widget (Spotify card) style.
 *
 * The SERVER owns the preference: it is stored on the user row
 * (`musicWidgetStyle`) and validated against the Netrex entitlement there —
 * premium styles without entitlement are stored as `vinyl` and the response
 * confirms it. This store keeps an OPTIMISTIC value for instant UI, rolls it
 * back when the request fails, and follows the authoritative user object
 * whenever it changes (including the server-side fallback).
 */

interface MusicWidgetState {
  /** Optimistic selection (equals the saved value when nothing is in flight). */
  selected: MusicStyleId | null;
  /** True while the PATCH is in flight (blocks double-clicks, shows pending). */
  saving: boolean;
  selectStyle: (style: MusicStyleId) => Promise<void>;
  /** Local-only selection used by the hub's live preview (never persisted). */
  previewStyle: MusicStyleId | null;
  setPreviewStyle: (style: MusicStyleId | null) => void;
  resetOptimistic: () => void;
}

export const useMusicWidgetStore = create<MusicWidgetState>((set, get) => ({
  selected: null,
  saving: false,
  previewStyle: null,

  selectStyle: async (style) => {
    if (get().saving) return;
    const prev = get().selected;
    set({ selected: style, saving: true });
    try {
      const updated: User = await api.users.update({ musicWidgetStyle: style });
      // Server response is the truth (it may have fallen back to vinyl).
      // setUser ALSO refreshes netrexEnabled from the authoritative source,
      // so a permanently-granted Netrex licence picked up mid-session
      // unblocks the Apply button on the very next interaction.
      useAuthStore.getState().setUser(updated);
      const confirmed = isMusicStyleId(updated.musicWidgetStyle)
        ? updated.musicWidgetStyle
        : 'vinyl';
      set({ selected: confirmed, saving: false, previewStyle: null });
    } catch {
      // Rollback on failure — UI returns to the previous selection.
      set({ selected: prev, saving: false });
      throw new Error('music_style_save_failed');
    }
  },

  setPreviewStyle: (style) => set({ previewStyle: style }),
  resetOptimistic: () => set({ selected: null, previewStyle: null }),
}));

/**
 * Effective style for the CURRENT VIEWER's own profile card (popout, modal,
 * home). Priority: live preview (hub editor) → optimistic in-flight selection
 * → saved user value. Premium styles without entitlement fall back to vinyl.
 */
export function useMusicStyleForSelf(): MusicStyleId {
  const isNetrex = useAuthStore((s) => s.user?.netrexEnabled ?? false);
  const saved = useAuthStore((s) => s.user?.musicWidgetStyle);
  const optimistic = useMusicWidgetStore((s) => s.selected);
  const preview = useMusicWidgetStore((s) => s.previewStyle);

  if (preview) return preview;
  if (optimistic) return optimistic;
  return resolveMusicStyle(isMusicStyleId(saved) ? saved : undefined, isNetrex);
}

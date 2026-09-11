import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useAuthStore } from './authStore';

/**
 * Local, client-side activation state for Netrex features.
 *
 * IMPORTANT: this store never *grants* anything. Every consumer must combine a
 * stored preference with the real backend entitlement
 * (`useAuthStore().user.netrexEnabled`) before enabling a premium behavior.
 * Toggling a preference without the entitlement has no effect.
 */
export type NetrexFeatureId = 'activityMemberPanel' | 'memberGridCompact' | 'profileGlow';

interface NetrexPrefsState {
  /** Which Netrex features the user has explicitly activated. */
  activeFeatures: NetrexFeatureId[];
  /** Default layout of the Activity Member Panel (config for that feature). */
  memberPanelMode: 'activity' | 'standard';
  toggleFeature: (id: NetrexFeatureId) => void;
  setMemberPanelMode: (mode: 'activity' | 'standard') => void;
}

export const useNetrexPrefsStore = create<NetrexPrefsState>()(
  persist(
    (set, get) => ({
      activeFeatures: ['activityMemberPanel'],
      memberPanelMode: 'activity',

      toggleFeature: (id) => {
        // Hard entitlement gate: ignore toggles when Netrex is not active.
        if (useAuthStore.getState().user?.netrexEnabled !== true) return;
        const has = get().activeFeatures.includes(id);
        set({
          activeFeatures: has
            ? get().activeFeatures.filter((f) => f !== id)
            : [...get().activeFeatures, id],
        });
      },

      setMemberPanelMode: (mode) => {
        if (useAuthStore.getState().user?.netrexEnabled !== true) return;
        set({ memberPanelMode: mode });
      },
    }),
    {
      name: 'vertex.netrex.features',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeFeatures: state.activeFeatures,
        memberPanelMode: state.memberPanelMode,
      }),
    }
  )
);

/** Convenience hook: is a given Netrex feature currently active for this user? */
export function useNetrexFeatureActive(id: NetrexFeatureId): boolean {
  const isNetrex = useAuthStore((s) => s.user?.netrexEnabled ?? false);
  const activeFeatures = useNetrexPrefsStore((s) => s.activeFeatures);
  return isNetrex && activeFeatures.includes(id);
}

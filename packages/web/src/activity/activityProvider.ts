import { create } from 'zustand';
import type { Activity } from '@backspace/shared';

/**
 * Activity Provider system.
 *
 * Providers are the single source of truth for the local user's rich
 * activity. The UI (activity feeds, profile cards, presence menu) consumes
 * the registry's resolved activity — it never knows which provider produced
 * it. Adding a future DesktopActivityProvider (Electron/Tauri process
 * detection) is a one-line registration away, with no UI changes required.
 *
 * Resolution order = registration order: the first provider returning a
 * non-null activity wins. Providers are expected to be registered once at
 * app startup.
 */
export interface ActivityProvider {
  /** Stable provider id, e.g. 'manual', 'desktop', 'spotify'. */
  readonly id: string;
  /**
   * Return the current activity, or null when this provider has nothing to
   * show right now. Called synchronously (poll-driven stores may compute on
   * the fly); the result is treated as immutable.
   */
  getCurrentActivity(): Activity | null;
  /**
   * Optional tick hook. Providers with external triggers (OS events, timers)
   * call the supplied `notify` callback when their activity may have changed,
   * which re-evaluates the registry.
   */
  setup?(notify: () => void): void | (() => void);
}

interface ActivityProviderState {
  providers: ActivityProvider[];
  /** Monotonic counter bumped whenever the resolved activity may have changed. */
  revision: number;

  register: (provider: ActivityProvider) => () => void;
  unregister: (id: string) => void;
  notifyChange: () => void;
}

export const useActivityProviderRegistry = create<ActivityProviderState>((set, get) => ({
  providers: [],
  revision: 0,

  register: (provider) => {
    // Replace on duplicate id (idempotent re-registration, e.g. HMR).
    const providers = [...get().providers.filter((p) => p.id !== provider.id), provider];
    set({ providers });
    let teardown: void | (() => void);
    try {
      teardown = provider.setup?.(() => get().notifyChange());
    } catch (e) {
      console.warn(`[activityProvider] setup failed for "${provider.id}"`, e);
    }
    get().notifyChange();
    return () => {
      if (typeof teardown === 'function') teardown();
    };
  },

  unregister: (id) => {
    set({ providers: get().providers.filter((p) => p.id !== id) });
    get().notifyChange();
  },

  notifyChange: () => set((s) => ({ revision: s.revision + 1 })),
}));

/**
 * Resolve the current activity from the registry (first non-null wins).
 * Prefer the `useCurrentActivity()` hook in React components — this is the
 * imperative counterpart for non-React call sites.
 */
export function resolveCurrentActivity(): Activity | null {
  for (const provider of useActivityProviderRegistry.getState().providers) {
    try {
      const activity = provider.getCurrentActivity();
      if (activity) return activity;
    } catch (e) {
      console.warn(`[activityProvider] getCurrentActivity failed for "${provider.id}"`, e);
    }
  }
  return null;
}

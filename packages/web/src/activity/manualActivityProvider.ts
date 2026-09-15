import { create } from 'zustand';
import type { Activity, ActivityType } from '@vertex/shared';
import {
  useActivityProviderRegistry,
  resolveCurrentActivity,
} from './activityProvider';
import { wsSendAll } from '../hooks/useWebSocket';
import { useActivityStore } from '../stores/activityStore';

/**
 * ManualActivityProvider — the web provider.
 *
 * The user picks an activity from the presence menu ("Playing…",
 * "Listening…", "Watching…" or free text). The selection is persisted to
 * localStorage so it survives reloads and is re-pushed on WS reconnect via
 * the ready handler (activityStore.myActivities path).
 */

const STORAGE_KEY = 'backspace_manual_activity';

interface ManualSelection {
  type: ActivityType;
  name: string;
  startedAt: number;
}

function loadSelection(): ManualSelection | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ManualSelection;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.name !== 'string' ||
      parsed.name.length === 0 ||
      typeof parsed.startedAt !== 'number' ||
      !['playing', 'listening', 'watching', 'streaming', 'custom'].includes(parsed.type)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveSelection(sel: ManualSelection | null): void {
  try {
    if (sel) localStorage.setItem(STORAGE_KEY, JSON.stringify(sel));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable — in-memory only */
  }
}

interface ManualActivityState {
  selection: ManualSelection | null;
  setManualActivity: (type: ActivityType, name: string) => void;
  clearManualActivity: () => void;
}

export const useManualActivityStore = create<ManualActivityState>((set) => ({
  selection: loadSelection(),

  setManualActivity: (type, name) => {
    const trimmed = name.trim().slice(0, 64);
    if (!trimmed) return;
    const selection: ManualSelection = { type, name: trimmed, startedAt: Date.now() };
    saveSelection(selection);
    set({ selection });
    // Broadcast immediately: activityStore push (debounced WS send) + direct
    // send so other clients see the new activity without the 5s debounce lag.
    pushCurrentManualActivity();
    useActivityProviderRegistry.getState().notifyChange();
  },

  clearManualActivity: () => {
    saveSelection(null);
    set({ selection: null });
    // Broadcast the clear (empty activities) so other clients drop the row.
    useActivityStore.getState().pushActivities([]);
    wsSendAll({ type: 'activity_update', activities: [] });
    useActivityProviderRegistry.getState().notifyChange();
  },
}));

/** Build the wire-format Activity from the stored selection. */
function selectionToActivity(sel: ManualSelection): Activity {
  return {
    type: sel.type,
    name: sel.name,
    timestamps: { start: sel.startedAt },
  };
}

/** Imperative activity push shared by the provider and the reconnect path. */
export function pushCurrentManualActivity(): void {
  const selection = useManualActivityStore.getState().selection;
  if (!selection) return;
  const activity = selectionToActivity(selection);
  useActivityStore.getState().pushActivities([activity]);
  wsSendAll({ type: 'activity_update', activities: [activity] });
}

/**
 * The manual/web activity provider. Registered at app startup; the desktop
 * provider (Electron/Tauri) will slot in before it via registration order.
 */
export const manualActivityProvider = {
  id: 'manual',
  getCurrentActivity(): Activity | null {
    const sel = useManualActivityStore.getState().selection;
    return sel ? selectionToActivity(sel) : null;
  },
  setup(notify: () => void): () => void {
    // Re-push on WS (re)connect so other clients hydrate immediately —
    // mirrors the Electron bridge's reconnect behavior.
    const unsubConnect = subscribeToReady(notify);
    return () => {
      unsubConnect();
    };
  },
};

// Reconnect subscription: the useWebSocket ready handler pushes
// activityStore.myActivities; we additionally re-resolve here by listening
// to the store's showActivity toggles (setShowActivity(false) clears and
// broadcasts an empty array already — nothing to do there).
function subscribeToReady(notify: () => void): () => void {
  // The ready handler calls pushActivities → myActivities changes; notify so
  // the registry re-evaluates and any UI dependent on resolution refreshes.
  let last: unknown = null;
  return useActivityStore.subscribe((state) => {
    if (state.myActivities !== last) {
      last = state.myActivities;
      notify();
    }
  });
}

/** Register the manual provider. Safe to call multiple times. */
export function initManualActivityProvider(): void {
  useActivityProviderRegistry.getState().register(manualActivityProvider);
}

export { resolveCurrentActivity };

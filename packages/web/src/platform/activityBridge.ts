import type { Activity } from '@backspace/shared';
import { useActivityStore } from '../stores/activityStore';
import { desktopSpotifyToRichActivity, resolveCoverForDesktopSpotify } from '../spotify/desktopSpotifyActivity';

let unsubscribe: (() => void) | null = null;

/**
 * Promote a desktop-detected activity for the activity store:
 *  - a Spotify activity carrying a parsed track (Vía A) becomes a RICH
 *    `type:'spotify'` activity with song/artist/cover — the music card then
 *    renders with real data for free accounts;
 *  - the bare "Spotify" (no parseable title) stays a generic 'listening'
 *    activity, exactly as before.
 * Shared with useWebSocket's reconnect re-push (same promotion, one code path).
 */
export async function promoteDesktopActivity(activity: Activity | null): Promise<Activity | null> {
  if (!activity) return null;
  if (activity.type !== 'listening' || activity.name !== 'Spotify' || !activity.spotify) {
    return activity;
  }
  const promoted = desktopSpotifyToRichActivity(activity);
  if (promoted.type === 'spotify' && promoted.spotify) {
    return resolveCoverForDesktopSpotify(promoted.spotify);
  }
  return promoted;
}

/** Push with cover prefetch (cover resolution is async, best-effort). */
async function pushPromoted(activity: Activity | null): Promise<void> {
  const promoted = await promoteDesktopActivity(activity);
  useActivityStore.getState().pushActivities(promoted ? [promoted] : []);
}

export function initActivityBridge(): void {
  if (unsubscribe) return; // already initialized
  if (!window.backspace?.onActivityDetected) return; // not Electron

  // Subscribe to future activity changes from main process
  unsubscribe = window.backspace.onActivityDetected((activity) => {
    void pushPromoted(activity as Activity | null);
  });

  // Request current state (handles instance-switch: game was already running)
  window.backspace.getCurrentActivity?.().then((activity: unknown) => {
    void pushPromoted(activity as Activity | null);
  }).catch(() => {});
}

export function teardownActivityBridge(): void {
  unsubscribe?.();
  unsubscribe = null;
}

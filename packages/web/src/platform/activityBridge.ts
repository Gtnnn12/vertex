import type { Activity } from '@vertex/shared';
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
 * Accepts a single activity (legacy shape) or an ARRAY (game + music
 * coexistence: [game, spotify] — order defines primarity).
 * Shared with useWebSocket's reconnect re-push (same promotion, one code path).
 */
export async function promoteDesktopActivity(
  activity: Activity | Activity[] | null,
): Promise<Activity[] | null> {
  if (!activity) return null;
  const list = Array.isArray(activity) ? activity : [activity];
  const promoted: Activity[] = [];
  for (const a of list) {
    if (!a) continue;
    if (a.type !== 'listening' || a.name !== 'Spotify' || !a.spotify) {
      promoted.push(a);
      continue;
    }
    const rich = desktopSpotifyToRichActivity(a);
    if (rich.type === 'spotify' && rich.spotify) {
      promoted.push(await resolveCoverForDesktopSpotify(rich.spotify));
    } else {
      promoted.push(rich);
    }
  }
  return promoted.length > 0 ? promoted : null;
}

/**
 * Merge the desktop-detected activities into the store WITHOUT erasing the
 * live Spotify activity (regression guard): game detections and music
 * coexist — game rows keep the front (primary) position, one Spotify row max.
 * `null` only clears the desktop's own rows, never the whole board.
 */
export function pushPromoted(activities: Activity[] | null): void {
  const store = useActivityStore.getState();
  const prev = store.myActivities ?? [];
  const prevSpotify = prev.find((a) => a.type === 'spotify' && a.spotify) ?? null;

  if (!activities || activities.length === 0) {
    // Desktop reports nothing: keep any surviving rich Spotify row only if
    // the desktop itself didn't just clear Spotify (a bare null means game
    // exit; the independent tracker re-adds Spotify on the next poll if it
    // is still playing).
    const keep = prev.filter((a) => a.type === 'spotify' && a.spotify);
    store.pushActivities(keep);
    return;
  }

  // Spotify rows: a rich Vía A row (type 'spotify' with parsed track) OR the
  // bare generic row (type 'listening', name 'Spotify') when the window title
  // is unparseable. Either way it must survive a game coexistence push — a
  // game event can NEVER wipe the music (NUNCA sobrescribir spotify).
  const isSpotifyRow = (a: Activity) => a.type === 'spotify' || /spotify/i.test(a.name);
  const gameRows = activities.filter((a) => !isSpotifyRow(a));
  const incomingSpotify = activities.find(isSpotifyRow) ?? null;
  // Prefer the incoming row; keep the previous rich row when the push has no
  // Spotify at all (e.g. a game-only legacy emit). A generic incoming row
  // never downgrades a rich one (unparseable title ≠ track changed back to
  // nothing we can prove): rich beats generic, newest rich beats old rich.
  const incomingIsRich = incomingSpotify?.type === 'spotify' && !!incomingSpotify.spotify;
  const spotify =
    incomingSpotify && (incomingIsRich || !prevSpotify)
      ? incomingSpotify
      : incomingSpotify ?? prevSpotify;

  const next: Activity[] = [...gameRows];
  if (spotify) next.push(spotify);
  store.pushActivities(next.length > 0 ? next : []);
}

export function initActivityBridge(): void {
  if (unsubscribe) return; // already initialized
  if (!window.backspace?.onActivityDetected) return; // not Electron

  // Subscribe to future activity changes from main process.
  // Legacy single-activity payloads are normalized inside promoteDesktopActivity.
  unsubscribe = window.backspace.onActivityDetected((payload) => {
    void promoteDesktopActivity(payload as Activity | Activity[] | null).then(pushPromoted);
  });

  // Request current state (handles instance-switch: game was already running)
  window.backspace.getCurrentActivity?.().then((payload: unknown) => {
    void promoteDesktopActivity(payload as Activity | Activity[] | null).then(pushPromoted);
  }).catch(() => {});
}

export function teardownActivityBridge(): void {
  unsubscribe?.();
  unsubscribe = null;
}

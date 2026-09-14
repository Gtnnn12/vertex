import { create } from 'zustand';
import type { Activity } from '@backspace/shared';
import { wsSendAll } from '../hooks/useWebSocket';

let pushTimer: ReturnType<typeof setTimeout> | null = null;

interface ActivityState {
  userActivities: Map<string, Activity[]>;
  showActivity: boolean;
  myActivities: Activity[] | null;

  setUserActivities: (userId: string, activities: Activity[]) => void;
  clearUserActivities: (userId: string) => void;
  initActivities: (activityMap: Record<string, Activity[]>) => void;
  setShowActivity: (show: boolean) => void;
  pushActivities: (activities: Activity[]) => void;
  reset: () => void;
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  userActivities: new Map(),
  showActivity: true,
  myActivities: null,

  setUserActivities: (userId, activities) => {
    set((state) => {
      const next = new Map(state.userActivities);
      if (activities.length === 0) {
        next.delete(userId);
      } else {
        next.set(userId, activities);
      }
      return { userActivities: next };
    });
  },

  clearUserActivities: (userId) => {
    set((state) => {
      const next = new Map(state.userActivities);
      next.delete(userId);
      return { userActivities: next };
    });
  },

  initActivities: (activityMap) => {
    set((state) => {
      const next = new Map(state.userActivities);
      for (const [userId, activities] of Object.entries(activityMap)) {
        if (activities.length > 0) {
          next.set(userId, activities);
        } else {
          next.delete(userId);
        }
      }
      return { userActivities: next };
    });
  },

  setShowActivity: (show) => {
    set({ showActivity: show });
    if (!show) {
      if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
      wsSendAll({ type: 'activity_update', activities: [] });
      set({ myActivities: null });
    }
  },

  pushActivities: (activities) => {
    if (!get().showActivity) return;
    // ── COVER REGRESSION GUARD ─────────────────────────────────────────
    // The poll chain is async: an early push can carry NO cover while the
    // cover resolves downstream (server merge, search-cover round-trip).
    // If a later push for the SAME track arrives still coverless it must
    // NOT erase the rich activity already in the store — otherwise the
    // widget flips back to the fallback logo even though the cover exists.
    const prevSpotify = get().myActivities?.find(
      (a) => a.type === 'spotify' && a.spotify,
    )?.spotify;
    if (prevSpotify?.albumCover) {
      const incoming = activities.find((a) => a.type === 'spotify' && a.spotify && !a.spotify.albumCover);
      if (incoming && incoming.spotify) {
        incoming.spotify = { ...incoming.spotify, albumCover: prevSpotify.albumCover };
      }
    }
    // [TEMP-TRACE b] what the bridge actually put in the store
    for (const a of activities) {
      if (a.type === 'spotify' || /spotify/i.test(a.name)) {
        // eslint-disable-next-line no-console
        console.log(`[activity-emit] type=${a.type} name="${a.name}" payload=${a.spotify ? `song="${a.spotify.song}" artist="${a.spotify.artist}" cover=${a.spotify.albumCover ? 'yes' : 'no'}` : 'NONE'}`);
      }
    }
    set({ myActivities: activities });
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      // [TEMP-TRACE b] what is actually sent to the server after the 5s debounce
      const rich = activities.find((a) => a.type === 'spotify' && a.spotify);
      if (rich || activities.some((a) => /spotify/i.test(a.name))) {
        // eslint-disable-next-line no-console
        console.log(`[activity-emit] ws_send activities=${activities.length} richSpotify=${rich ? `song="${rich.spotify!.song}"` : 'none'}`);
      }
      wsSendAll({ type: 'activity_update', activities });
      pushTimer = null;
    }, 5000);
  },

  reset: () => {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    set({ userActivities: new Map(), showActivity: true, myActivities: null });
  },
}));

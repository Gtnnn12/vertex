import { useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useSocialStore } from '../stores/socialStore';
import { useSpaceStore } from '../stores/spaceStore';
import { useInstanceStore } from '../stores/instanceStore';
import { wsSendAll, wsSend } from './useWebSocket';

export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'offline';

/**
 * Optimistically apply a presence status to every local cache that renders
 * presence: authStore (own user), socialStore (friends list), spaceStore
 * (members + userViews). The WS broadcast will confirm for other clients;
 * these local writes make the switch feel instant and cover self-echo loss.
 */
function applyLocalPresence(status: PresenceStatus): void {
  const me = useAuthStore.getState().user;
  if (!me) return;

  useAuthStore.setState({ user: { ...me, status } });
  useSocialStore.getState().updateFriendPresence(me.id, status);
  useSpaceStore.getState().updateMemberPresence(me.id, status);
}

/**
 * Self presence control. Sends a WS `presence_update` on every connected
 * origin (home + federated instances) and updates local caches optimistically.
 *
 * Statuses: 'online' | 'idle' | 'dnd' | 'offline' (offline = Invisible —
 * the user stays connected but appears offline to everyone else).
 */
export function useSetPresence(): (status: PresenceStatus) => void {
  return useCallback((status: PresenceStatus) => {
    applyLocalPresence(status);

    const me = useAuthStore.getState().user;
    if (!me) return;

    // Remote/federated instances first (each needs its own WS event).
    const instances = useInstanceStore.getState().instances;
    for (const inst of instances) {
      if (inst.status === 'connected' && inst.origin) {
        wsSend({ type: 'presence_update', status }, inst.origin);
      }
    }
    // Home instance last (covers the plain single-instance case).
    wsSendAll({ type: 'presence_update', status });
  }, []);
}

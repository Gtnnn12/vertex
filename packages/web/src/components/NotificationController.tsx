import { useEffect, useRef } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { isElectron } from '../platform/platform';
import { sendNotification, updateBadgeCount } from '../platform/notifications';
import { useLanguage } from '../contexts/LanguageContext';

/**
 * Headless component that bridges store events to native OS notifications and badge counts.
 * Renders nothing — lives alongside SoundController in AppLayout.
 */
export function NotificationController() {
  const { t } = useLanguage();
  const currentUser = useAuthStore((s) => s.user);
  const isInitialMount = useRef(true);
  const windowFocused = useRef(true);

  // Track window focus state
  useEffect(() => {
    if (isElectron() && window.backspace) {
      window.backspace.onWindowFocusChange((focused) => {
        windowFocused.current = focused;
      });
    }

    // Browser fallback focus tracking
    const onFocus = () => { windowFocused.current = true; };
    const onBlur = () => { windowFocused.current = false; };
    const onVisibility = () => {
      windowFocused.current = document.visibilityState === 'visible' && document.hasFocus();
    };

    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);

    // Sync initial state
    windowFocused.current = document.hasFocus();

    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Message notifications
  useEffect(() => {
    const timer = setTimeout(() => {
      isInitialMount.current = false;
    }, 1000);

    const unsubscribeChat = useChatStore.subscribe((state, prevState) => {
      if (isInitialMount.current) return;
      if (windowFocused.current) return;

      if (state.realtimeMessageEvents.length > prevState.realtimeMessageEvents.length) {
        const newEvents = state.realtimeMessageEvents.slice(prevState.realtimeMessageEvents.length);
        for (const { message } of newEvents) {
          if (message.userId !== currentUser?.id) {
            const displayName = message.user?.displayName || message.user?.username || 'Someone';
            const body = message.content
              ? message.content.replace(/[*_~`>#\-\[\]]/g, '').slice(0, 100)
              : t('sent_an_attachment');
            sendNotification(displayName, body, {
              channelId: message.channelId,
            });
            break; // one notification per batch
          }
        }
      }
    });

    return () => {
      clearTimeout(timer);
      unsubscribeChat();
    };
  }, [currentUser?.id]);

  // Badge count (Electron only)
  useEffect(() => {
    const unsubscribe = useChatStore.subscribe((state) => {
      updateBadgeCount(state.unreadChannels.size);
    });
    return unsubscribe;
  }, []);

  return null;
}

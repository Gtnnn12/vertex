import React from 'react';
import type { ContextMenuItem } from '../../stores/contextMenuStore';
import type { User } from '@backspace/shared';
import { useLanguage } from '../../contexts/LanguageContext';
import { useSetPresence } from '../../hooks/usePresence';
import { PRESENCE_META, PRESENCE_ORDER, type PresenceStatus } from '../../utils/presence';
import { ActivityPicker } from './ActivityPicker';

/**
 * Presence status submenu for the user area (bottom-left profile).
 * Online / Idle / Do Not Disturb / Invisible (offline). Selecting an option
 * sends a WS `presence_update` to all connected instances and updates local
 * caches optimistically.
 */
export function usePresenceMenuItems(user: User): ContextMenuItem[] {
  const { t } = useLanguage();
  const setPresence = useSetPresence();

  const current = user.status ?? 'online';

  const presenceItems: ContextMenuItem[] = PRESENCE_ORDER.map((status) => {
    const meta = PRESENCE_META[status];
    return {
      type: 'action' as const,
      key: `presence-${status}`,
      label: `${t(meta.labelKey)}${current === status ? ' ✓' : ''}`,
      icon: (
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: meta.hex,
            flexShrink: 0,
          }}
        />
      ),
      onClick: () => setPresence(status as PresenceStatus),
    };
  });

  // Activity picker widget (manual/web provider).
  const activitySummary: ContextMenuItem[] = [
    { type: 'separator' as const, key: 'activity-sep-top' },
    {
      type: 'custom' as const,
      key: 'activity-picker',
      render: () => <ActivityPicker />,
    },
  ];

  return [...presenceItems, ...activitySummary];
}

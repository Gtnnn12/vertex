import React from 'react';
import type { ContextMenuItem } from '../../stores/contextMenuStore';
import type { User } from '@backspace/shared';
import { useLanguage } from '../../contexts/LanguageContext';
import { useSetPresence, type PresenceStatus } from '../../hooks/usePresence';
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

  const statuses: Array<{ status: PresenceStatus; label: string; color: string }> = [
    { status: 'online', label: t('online'), color: '#23a55a' },
    { status: 'idle', label: t('idle'), color: '#3ba1e8' },
    { status: 'dnd', label: t('do_not_disturb'), color: '#f0a832' },
    { status: 'offline', label: t('invisible'), color: '#80848e' },
  ];

  const presenceItems: ContextMenuItem[] = statuses.map(({ status, label, color }) => ({
    type: 'action' as const,
    key: `presence-${status}`,
    label: `${label}${current === status ? ' ✓' : ''}`,
    icon: (
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: 10,
          height: 10,
          borderRadius: '50%',
          backgroundColor: color,
          flexShrink: 0,
        }}
      />
    ),
    onClick: () => setPresence(status),
  }));

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

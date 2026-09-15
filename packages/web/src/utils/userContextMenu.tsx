// packages/web/src/utils/userContextMenu.ts
// Builds the USER context menu for every surface (DM list, server member
// sidebar, chat avatars, friends list, active-now panel) using the
// centralized contextMenuStore. One builder — never per-surface menus.
//
// BLOCK: the server has NO block endpoint/table today, so no block items
// here. When one lands, add it in this builder only.
import React from 'react';
import type { User } from '@vertex/shared';
import type { ContextMenuItem } from '../stores/contextMenuStore';
import type { TaggedFriend, TaggedFriendRequest } from '../stores/socialStore';
import { getFriendshipStatus } from './friendship';
import { isSelf } from './identity';

export interface UserContextMenuOptions {
  /** The user the menu is about. */
  user: User;
  /** The logged-in user (null = not loaded). */
  me: User | null;
  friends: TaggedFriend[];
  requests: TaggedFriendRequest[];
  t: (key: string) => string;
  /** Opens the profile popout. Required. */
  onViewProfile: (user: User) => void;
  /** DM-list only: closes/hides this 1-on-1 conversation. */
  onCloseDm?: () => void;
  /** Social actions — wired to socialStore by the caller. */
  onAddFriend?: () => void;
  onRemoveFriend?: () => void;
  onCancelRequest?: () => void;
  onAcceptRequest?: () => void;
  onDeclineRequest?: () => void;
}

/** Small inline SVG icon factory (stroke style, matches the app's icons). */
function ico(paths: React.ReactNode): React.ReactNode {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 opacity-80">
      {paths}
    </svg>
  );
}

const ICONS = {
  person: <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  add: <><circle cx="9" cy="7" r="4" /><path d="M2 21v-2a4 4 0 014-4h6" /><path d="M19 8v6M22 11h-6" /></>,
  remove: <><circle cx="9" cy="7" r="4" /><path d="M2 21v-2a4 4 0 014-4h6" /><path d="M17 11h6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>,
  check: <path d="M20 6L9 17l-5-5" />,
  x: <path d="M18 6L6 18M6 6l12 12" />,
  mail: <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />,
};

export function buildUserContextMenuItems(opts: UserContextMenuOptions): ContextMenuItem[] {
  const { user, me, friends, requests, t, onViewProfile } = opts;
  const items: ContextMenuItem[] = [];

  const isMe = !!(me && isSelf(user, me));
  const friendship = getFriendshipStatus(user, me, friends, requests);

  // 1. Ver perfil — always, for everyone including self.
  items.push({
    key: 'view-profile',
    type: 'action',
    label: t('menu_view_profile'),
    icon: ico(ICONS.person),
    onClick: () => onViewProfile(user),
  });

  // Friendship actions — never for self.
  if (!isMe) {
    if (friendship.state === 'none' && opts.onAddFriend) {
      items.push({
        key: 'add-friend',
        type: 'action',
        label: t('profile_action_add_friend'),
        icon: ico(ICONS.add),
        onClick: opts.onAddFriend,
      });
    }
    if (friendship.state === 'outbound_pending' && opts.onCancelRequest) {
      items.push({
        key: 'cancel-request',
        type: 'action',
        label: t('profile_action_cancel_request'),
        icon: ico(ICONS.clock),
        onClick: opts.onCancelRequest,
      });
    }
    if (friendship.state === 'inbound_pending') {
      if (opts.onAcceptRequest) {
        items.push({
          key: 'accept-request',
          type: 'action',
          label: t('profile_action_accept'),
          icon: ico(ICONS.check),
          onClick: opts.onAcceptRequest,
        });
      }
      if (opts.onDeclineRequest) {
        items.push({
          key: 'decline-request',
          type: 'action',
          label: t('profile_action_ignore'),
          icon: ico(ICONS.x),
          onClick: opts.onDeclineRequest,
        });
      }
    }
    if (friendship.state === 'friends' && opts.onRemoveFriend) {
      items.push({
        key: 'remove-friend',
        type: 'action',
        label: t('profile_action_remove_friend'),
        icon: ico(ICONS.remove),
        danger: true,
        onClick: opts.onRemoveFriend,
      });
    }
  }

  // 2. Cerrar MD — only passed by the DM list surface.
  if (opts.onCloseDm) {
    items.push({ key: 'dm-sep', type: 'separator' });
    items.push({
      key: 'close-dm',
      type: 'action',
      label: t('close_dm'),
      icon: ico(ICONS.mail),
      onClick: opts.onCloseDm,
    });
  }

  return items;
}

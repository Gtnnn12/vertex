import React, { useEffect, useMemo } from 'react';
import { useSocialStore } from '../../stores/socialStore';
import { useUIStore } from '../../stores/uiStore';
import { useActivityStore } from '../../stores/activityStore';
import { Avatar } from '../ui/Avatar';
import { Username } from '../ui/Username';
import { ActivityCard, hasRichActivity, getActivityAccentClass } from '../ui/ActivityCard';
import type { Friend, Activity, User } from '@backspace/shared';
import { CompactMembersGrid } from './CompactMembersGrid';
import { useAuthStore } from '../../stores/authStore';
import { useNetrexFeatureActive } from '../../stores/netrexPrefsStore';
import { getPrimaryActivity } from '@backspace/shared/src/activities.js';
import { parseFederatedUsername, isFederationGlobeApplicable } from '../../utils/identity';
import { useCanonicalUserView } from '../../utils/userViewLookup';
import { useLanguage } from '../../contexts/LanguageContext';

function ActivityBadge({ type }: { type: Activity['type'] }) {
  const getBadgeStyles = () => {
    switch (type) {
      case 'playing':
        return 'bg-accent-mint/20 text-accent-mint';
      case 'listening':
        return 'bg-accent-sky/20 text-accent-sky';
      case 'watching':
        return 'bg-accent-lavender/20 text-accent-lavender';
      case 'streaming':
        return 'bg-accent-rose/20 text-accent-rose';
      case 'spotify':
        return 'bg-[#1DB954]/20 text-[#1DB954]';
      default:
        return 'bg-white/10 text-txt-tertiary';
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'playing':
        return (
          <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        );
      case 'listening':
        return (
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        );
      case 'watching':
        return (
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        );
      case 'streaming':
        return (
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M23 7l-7 5 7 5V7z" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
        );
      case 'spotify':
        return (
          <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.5 17.28a.75.75 0 0 1-1.03.25c-2.83-1.73-6.39-2.12-10.59-1.16a.75.75 0 1 1-.33-1.46c4.56-1.04 8.48-.59 11.64 1.34.36.21.47.67.31 1.03zm1.47-3.27a.94.94 0 0 1-1.29.31c-3.24-1.99-8.17-2.57-12-1.41a.94.94 0 1 1-.54-1.79c4.38-1.33 9.82-.68 13.55 1.6.44.27.58.85.28 1.29zm.13-3.4C15.24 8.33 8.82 8.12 5.09 9.25a1.12 1.12 0 1 1-.65-2.15c4.28-1.3 11.4-1.05 15.89 1.62a1.12 1.12 0 0 1-1.15 1.93z" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-wider ${getBadgeStyles()}`}>
      {getIcon()}
      {type}
    </span>
  );
}

function ActivityFriendRow({
  friend,
  isOffline,
  activities,
  isRichActivity,
  accentClass,
  onClickFriend,
}: {
  friend: Friend;
  isOffline: boolean;
  activities: Activity[];
  isRichActivity: boolean;
  accentClass: string;
  onClickFriend: (e: React.MouseEvent, friend: Friend) => void;
}) {
  const canonical = useCanonicalUserView(friend as unknown as User);
  const { baseName } = parseFederatedUsername(canonical.username);
  const friendDisplayName = canonical.displayName ?? baseName;
  const primary = getPrimaryActivity(activities);

  const getStatusColor = () => {
    if (isOffline) return 'bg-txt-tertiary/40';
    if (primary && primary.type !== 'custom') {
      switch (primary.type) {
        case 'playing': return 'bg-accent-mint';
        case 'listening': return 'bg-accent-sky';
        case 'watching': return 'bg-accent-lavender';
        case 'streaming': return 'bg-accent-rose';
        case 'spotify': return 'bg-[#1DB954]';
        default: return 'bg-status-online';
      }
    }
    return 'bg-status-online';
  };

  const rowClass = isRichActivity
    ? `group relative flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200 hover:bg-white/[0.04] border-l-2 ${accentClass}`
    : 'flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 hover:bg-white/[0.03]';

  return (
    <div
      onClick={(e) => onClickFriend(e, friend)}
      className={rowClass}
    >
      <div className="relative flex-shrink-0">
        <Avatar
          src={canonical.avatar}
          name={friendDisplayName}
          size={36}
          status={isOffline ? 'offline' : canonical.status}
          userId={canonical.homeUserId ?? canonical.id}
          avatarColor={canonical.avatarColor}
          className={isOffline ? 'opacity-50' : undefined}
        />
        <div className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-[var(--surface-base)] ${getStatusColor()}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Username
            username={friendDisplayName}
            className={`text-[13px] font-semibold truncate ${isOffline ? 'text-txt-tertiary/70' : 'text-txt-primary'}`}
          />
          {!isOffline && primary && (
            <ActivityBadge type={primary.type} />
          )}
        </div>
        {!isOffline && (
          <div className="mt-0.5">
            <ActivityCard
              activities={activities}
              fallbackCustomStatus={canonical.customStatus}
            />
          </div>
        )}
        {!isOffline && isFederationGlobeApplicable(canonical) && (
          <div className="text-[10px] leading-[1.3] text-txt-tertiary/60 truncate mt-0.5">@{parseFederatedUsername(canonical.username).domain}</div>
        )}
        {isOffline && (
          <div className="text-[10px] text-txt-tertiary/50 mt-0.5">Offline</div>
        )}
      </div>
    </div>
  );
}

export function ActivityPanel() {
  const { t } = useLanguage();
  const friends = useSocialStore((s) => s.friends);
  const loadFriends = useSocialStore((s) => s.loadFriends);
  const memberListOpen = useUIStore((s) => s.memberListOpen);
  const openUserProfile = useUIStore((s) => s.openUserProfile);
  const openModal = useUIStore((s) => s.openModal);
  const userActivities = useActivityStore((s) => s.userActivities);
  const me = useAuthStore((s) => s.user);
  // Netrex "Cuadrícula Compacta de Miembros": premium dense grid replaces the
  // classic list only when the entitlement AND the feature toggle are active.
  const compactGridActive = useNetrexFeatureActive('memberGridCompact');

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  const { activeFriends, onlineFriends, offlineFriends } = useMemo(() => {
    const active: Friend[] = [];
    const online: Friend[] = [];
    const offline: Friend[] = [];

    // The current user participates in "Active Now" too: prepend self as a
    // Friend-shaped row (deduped against the friends list by canonical id).
    const allUsers: Friend[] = me
      ? [
          {
            id: me.id,
            username: me.username,
            displayName: me.displayName,
            avatar: me.avatar,
            banner: me.banner,
            accentColor: me.accentColor,
            avatarColor: me.avatarColor,
            bio: me.bio,
            status: me.status ?? 'online',
            customStatus: me.customStatus,
            createdAt: me.createdAt,
            addedAt: me.createdAt,
            homeUserId: me.homeUserId ?? me.id,
            homeInstance: me.homeInstance,
          } as unknown as Friend,
          ...friends.filter((f) => (f.homeUserId ?? f.id) !== (me.homeUserId ?? me.id)),
        ]
      : friends;

    for (const f of allUsers) {
      if (f.status === 'offline') {
        // Self is never listed as offline (we're connected by definition),
        // even when the invisible status reports offline to others.
        const isSelf = me != null && (f.homeUserId ?? f.id) === (me.homeUserId ?? me.id);
        if (!isSelf) offline.push(f);
        else online.push(f);
        continue;
      }
      const activities = userActivities.get(f.homeUserId ?? f.id) ?? [];
      const primary = getPrimaryActivity(activities);
      // Active = has a non-custom activity (playing, listening, watching, streaming)
      if (primary && primary.type !== 'custom') {
        active.push(f);
      } else {
        online.push(f);
      }
    }

    return { activeFriends: active, onlineFriends: online, offlineFriends: offline };
  }, [friends, userActivities, me]);

  if (!memberListOpen) return null;

  const handleGridUserClick = (e: React.MouseEvent, user: User) => {
    e.stopPropagation();
    openUserProfile(user, e.currentTarget.getBoundingClientRect(), 'left');
  };

  const handleFriendClick = (e: React.MouseEvent, friend: Friend) => {
    e.stopPropagation();
    openUserProfile(
      {
        id: friend.id,
        username: friend.username,
        displayName: friend.displayName,
        avatar: friend.avatar,
        banner: friend.banner,
        accentColor: friend.accentColor,
        avatarColor: friend.avatarColor,
        bio: friend.bio,
        status: friend.status,
        customStatus: friend.customStatus,
        createdAt: friend.createdAt,
        homeUserId: friend.homeUserId,
        homeInstance: friend.homeInstance,
        isAdmin: false,
        replicatedInstances: [],
      },
      e.currentTarget.getBoundingClientRect(),
      'left',
    );
  };

  // Netrex compact grid: the HOME "Active Now" panel adopts the Discord-style
  // dense layout from the reference design. Non-Netrex users never reach this
  // branch, so the classic rendering below stays untouched.
  if (compactGridActive) {
    const online: User[] = [...activeFriends, ...onlineFriends].map((f) => ({
      id: f.id,
      username: f.username,
      displayName: f.displayName,
      avatar: f.avatar,
      banner: f.banner,
      accentColor: f.accentColor,
      avatarColor: f.avatarColor,
      bio: f.bio,
      status: f.status,
      customStatus: f.customStatus,
      createdAt: f.createdAt,
      homeUserId: f.homeUserId,
      homeInstance: f.homeInstance,
      isAdmin: false,
      replicatedInstances: [],
    }));
    return (
      <div className="w-[260px] bg-surface-channel/80 backdrop-blur-md flex-shrink-0 overflow-y-auto select-none no-scrollbar hidden md:flex flex-col border-l border-white/[0.04]">
        <div className="p-4">
          {(friends.length === 0 && !me) ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.05] bg-white/[0.02]">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-txt-tertiary/40"
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <p className="text-[13px] font-medium text-txt-secondary mb-1">{t('its_quiet_for_now')}</p>
              <p className="text-[11.5px] text-txt-tertiary/60 leading-[1.4] max-w-[180px]">
                {t('activity_panel_empty_hint')}
              </p>
            </div>
          ) : (
            <CompactMembersGrid
              users={online}
              getActivities={(u) => userActivities.get(u.homeUserId ?? u.id) ?? []}
              onMemberClick={handleGridUserClick}
              onAddClick={() => openModal('newDm')}
              addTitle={t('add_friend')}
            />
          )}
        </div>
      </div>
    );
  }

  const renderFriend = (friend: Friend, isOffline = false) => {
    const activities = userActivities.get(friend.homeUserId ?? friend.id) ?? [];
    const isRichActivity = !isOffline && hasRichActivity(activities);
    const primary = getPrimaryActivity(activities);
    const accentClass = primary ? getActivityAccentClass(primary.type) : '';
    return (
      <ActivityFriendRow
        key={friend.id}
        friend={friend}
        isOffline={isOffline}
        activities={activities}
        isRichActivity={isRichActivity}
        accentClass={accentClass}
        onClickFriend={handleFriendClick}
      />
    );
  };

  return (
    <div className="w-[260px] bg-surface-channel/80 backdrop-blur-md flex-shrink-0 overflow-y-auto select-none no-scrollbar hidden md:flex flex-col border-l border-white/[0.04]">
      <div className="p-4">
        <div className="flex items-center gap-2.5 mb-5 px-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03]">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-txt-tertiary"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-txt-primary leading-none">{t('active_now')}</h3>
            <p className="text-[10.5px] text-txt-tertiary/70 mt-0.5">{activeFriends.length + onlineFriends.length} active</p>
          </div>
        </div>

        {activeFriends.length === 0 && onlineFriends.length === 0 && offlineFriends.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.05] bg-white/[0.02]">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-txt-tertiary/40"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <p className="text-[13px] font-medium text-txt-secondary mb-1">{t('its_quiet_for_now')}</p>
            <p className="text-[11.5px] text-txt-tertiary/60 leading-[1.4] max-w-[180px]">
              {t('activity_panel_empty_hint')}
            </p>
          </div>
        ) : (
          <>
            {activeFriends.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-txt-tertiary/60">
                    Active Now
                  </span>
                  <span className="h-px flex-1 bg-white/[0.05]" />
                </div>
                <div className="flex flex-col gap-1">
                  {activeFriends.map(f => renderFriend(f))}
                </div>
              </div>
            )}
            {onlineFriends.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-txt-tertiary/60">
                    {t('online')} · {onlineFriends.length}
                  </span>
                  <span className="h-px flex-1 bg-white/[0.05]" />
                </div>
                <div className="flex flex-col gap-1">
                  {onlineFriends.map(f => renderFriend(f))}
                </div>
              </div>
            )}
            {offlineFriends.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-txt-tertiary/40">
                    {t('offline')} · {offlineFriends.length}
                  </span>
                  <span className="h-px flex-1 bg-white/[0.03]" />
                </div>
                <div className="flex flex-col gap-1">
                  {offlineFriends.map(f => renderFriend(f, true))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

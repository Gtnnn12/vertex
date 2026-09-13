import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User, DmChannel } from '@backspace/shared';
import { useSocialStore, type TaggedFriend, type TaggedFriendRequest, type TaggedUser } from '../../stores/socialStore';
import { useAuthStore } from '../../stores/authStore';
import { useDiscoverStore, type TaggedDiscoverUser } from '../../stores/discoverStore';
import { mapServerErrorToMessage } from '../../utils/friendErrors';
import { useSpaceStore } from '../../stores/spaceStore';
import { useInstanceStore } from '../../stores/instanceStore';
import { useUIStore } from '../../stores/uiStore';
import { useContextMenuStore } from '../../stores/contextMenuStore';
import { buildUserContextMenuItems } from '../../utils/userContextMenu';
import { pointAnchor } from '../../hooks/useFloatingPosition';
import { useFederationStore } from '../../stores/federationStore';
import { Avatar } from '../ui/Avatar';
import { MemberListToggleButton } from '../layout/MemberListToggleButton';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { getAvatarGradient } from '../../utils/gradients';
import { api } from '../../api/client';
import { Mascot } from '../ui/Mascot';
import { AvatarStack } from '../ui/AvatarStack';
import { useActivityStore } from '../../stores/activityStore';
import { ActivityCard, hasRichActivity, getActivityAccentClass } from '../ui/ActivityCard';
import { getPrimaryActivity } from '@backspace/shared/src/activities.js';
import { parseFederatedUsername, isSelf, isFederationGlobeApplicable } from '../../utils/identity';
import { formatDmTimestamp, formatDmHeaderName, formatDmSidebarPreview } from '../../utils/dmFormatters';
import { useCanonicalUserView } from '../../utils/userViewLookup';
import { Username } from '../ui/Username';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useLanguage } from '../../contexts/LanguageContext';

const statusLabel: Record<string, string> = { online: 'Online', idle: 'Idle', dnd: 'Do Not Disturb', offline: 'Offline' };

function ActivityFriendItem({
  friend,
  isOffline,
  activities,
  isRichActivity,
  accentClass,
  mobile,
  onMobileClick,
  onDmClick,
}: {
  friend: TaggedFriend;
  isOffline: boolean;
  activities: import('@backspace/shared').Activity[];
  isRichActivity: boolean;
  accentClass: string;
  mobile?: boolean;
  onMobileClick: (userId: string) => void;
  onDmClick: (id: string, homeUserId?: string, homeInstance?: string | null) => void;
}) {
  const canonical = useCanonicalUserView(friend as unknown as User);
  const { baseName } = parseFederatedUsername(canonical.username);
  const friendDisplayName = canonical.displayName ?? baseName;
  const { domain } = parseFederatedUsername(canonical.username);

  // Rich activity rows carry a thin pastel accent bar on their leading edge.
  // Plain rows stay quiet — hover surface is the only interaction cue.
  const rowClass = isRichActivity
    ? `group relative flex items-center gap-3.5 pl-4 pr-3.5 py-2.5 rounded-[14px] mb-0.5 cursor-pointer transition-all duration-200 hover:bg-white/[0.045] border-l-2 ${accentClass}`
    : 'group relative flex items-center gap-3.5 px-3.5 py-2.5 rounded-[14px] mb-0.5 cursor-pointer transition-colors duration-150 hover:bg-white/[0.045]';

  return (
    <div
      onClick={() => {
        if (mobile) {
          onMobileClick(friend.id);
        } else {
          onDmClick(friend.id, friend.homeUserId ?? undefined, friend.homeInstance);
        }
      }}
      className={rowClass}
    >
      <Avatar
        src={canonical.avatar}
        name={friendDisplayName}
        size={36}
        status={isOffline ? 'offline' : canonical.status}
        className={`flex-shrink-0 transition-opacity duration-200 ${isOffline ? 'opacity-45' : ''}`}
        userId={canonical.homeUserId ?? canonical.id}
        avatarColor={canonical.avatarColor}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Username
            username={friendDisplayName}
            className={`text-[13.5px] leading-[1.3] font-medium truncate tracking-[-0.01em] ${isOffline ? 'text-txt-tertiary' : 'text-txt-primary'}`}
          />
          {!isOffline && isFederationGlobeApplicable(canonical) && domain && (
            <span className="text-[10px] text-txt-tertiary/70 truncate font-normal flex-shrink-0">@{domain}</span>
          )}
        </div>
        {isOffline ? (
          <div className="text-[11px] leading-[1.3] text-txt-tertiary/50 mt-0.5">Offline</div>
        ) : (
          <ActivityCard
            activities={activities}
            fallbackCustomStatus={canonical.customStatus}
          />
        )}
      </div>
    </div>
  );
}

type Tab = 'online' | 'all' | 'pending' | 'add' | 'activity';

interface FriendsPageProps {
  mobile?: boolean;
}

export function FriendsPage({ mobile }: FriendsPageProps) {
  const [activeTab, setActiveTab] = useState<Tab>('online');
  const [pendingUnfriend, setPendingUnfriend] = useState<{ id: string; name: string } | null>(null);
  const navigate = useNavigate();
  const addDmChannel = useSpaceStore((s) => s.addDmChannel);
  const dmChannels = useSpaceStore((s) => s.dmChannels);
  const currentUser = useAuthStore((s) => s.user);
  const { t } = useLanguage();

  // If the user clicked "Retry your friend request" in the Connections panel
  // and we just navigated here, the federation store carries the original
  // target. Switching to the Add tab makes the AddFriendTab mount, which then
  // consumes the prefill into its query input. We only check on mount — the
  // store value is one-shot (cleared by AddFriendTab on consume).
  useEffect(() => {
    if (useFederationStore.getState().pendingFriendAddPrefill) {
      setActiveTab('add');
    }
  }, []);

  const {
    friends,
    requests,
    isLoading,
    loadFriends,
    loadRequests,
    updateFriendRequest,
    cancelFriendRequest,
    removeFriend
  } = useSocialStore();

  useEffect(() => {
    loadFriends();
    loadRequests();
  }, [loadFriends, loadRequests]);

  const userActivities = useActivityStore((s) => s.userActivities);
  const pushMobileScreen = useUIStore((s) => s.pushMobileScreen);

  const onlineFriends = friends.filter(f => f.status !== 'offline');
  const pendingIncoming = requests.filter(r => r.status === 'pending' && r.user?.id === r.fromId);
  const pendingOutgoing = requests.filter(r => r.status === 'pending' && r.user?.id === r.toId);

  const hour = new Date().getHours();
  const greetingKey = hour < 12 ? 'greeting_morning' : hour < 18 ? 'greeting_afternoon' : hour < 21 ? 'greeting_evening' : 'greeting_night';
  const heroName = currentUser?.displayName ?? parseFederatedUsername(currentUser?.username ?? '').baseName;

  const recentDms = dmChannels.filter(dm => dm.lastMessage).slice(0, 4);

  const handleOpenRecentDm = (dmId: string) => {
    useUIStore.getState().setShowDms(true);
    navigate(`/channels/@me/${dmId}`);
  };

  const handleOpenDm = async (friendId: string, homeUserId?: string, homeInstance?: string | null) => {
    try {
      // Check if a DM already exists with this user (on any instance)
      const existing = useSpaceStore.getState().findExistingDmForUser({ id: friendId, homeUserId: homeUserId ?? undefined });
      if (existing) {
        useUIStore.getState().setShowDms(true);
        navigate(`/channels/@me/${existing.dm.id}`);
        return;
      }
      const dmChannel = await api.dm.create({
        userId: homeInstance ? undefined : friendId,
        homeUserId: homeUserId ?? undefined,
        homeInstance: homeInstance ?? undefined,
      });
      addDmChannel(dmChannel);
      navigate(`/channels/@me/${dmChannel.id}`);
    } catch (err) {
      console.error('Failed to open DM:', err);
    }
  };

  const renderTabContent = () => {
    if (isLoading && friends.length === 0 && requests.length === 0) {
      return (
        <div className="flex items-center justify-center py-32">
          <LoadingSpinner />
        </div>
      );
    }

    switch (activeTab) {
      case 'online':
        return (
          <section className="animate-fade-in">
            <SectionLabel dotClass="bg-status-online/80">
              {t('online_count').replace('{count}', String(onlineFriends.length))}
            </SectionLabel>
            {onlineFriends.length === 0 ? (
              <EmptyState
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-txt-tertiary/60">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round" />
                  </svg>
                }
                title={t('no_one_online')}
                subtitle="When your friends come online, they'll appear here."
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {onlineFriends.map(friend => (
                  <FriendItem key={`${friend.id}:${friend._instanceOrigin}`} friend={friend} onRemove={() => setPendingUnfriend({ id: friend.id, name: friend.displayName ?? parseFederatedUsername(friend.username).baseName })} onDm={() => handleOpenDm(friend.id, friend.homeUserId ?? undefined, friend.homeInstance)} />
                ))}
              </div>
            )}
          </section>
        );
      case 'all':
        return (
          <section className="animate-fade-in">
            <SectionLabel dotClass="bg-accent-primary/70">
              {t('friends_count').replace('{count}', String(friends.length))}
            </SectionLabel>
            {friends.length === 0 ? (
              <EmptyState
                icon={<Mascot state="lonely" className="w-11 h-11 opacity-90" />}
                title={t('no_friends_yet')}
                subtitle="Add friends to start chatting privately."
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {friends.map(friend => (
                  <FriendItem key={`${friend.id}:${friend._instanceOrigin}`} friend={friend} onRemove={() => setPendingUnfriend({ id: friend.id, name: friend.displayName ?? parseFederatedUsername(friend.username).baseName })} onDm={() => handleOpenDm(friend.id, friend.homeUserId ?? undefined, friend.homeInstance)} />
                ))}
              </div>
            )}
          </section>
        );
      case 'pending':
        return (
          <section className="animate-fade-in flex flex-col gap-6">
            <SectionLabel dotClass="bg-accent-rose/80">
              {t('pending_count').replace('{count}', String(pendingIncoming.length + pendingOutgoing.length))}
            </SectionLabel>
            {[...pendingIncoming, ...pendingOutgoing].length === 0 ? (
              <EmptyState
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-txt-tertiary/60">
                    <path d="M4 4h16v12H4z" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M8 20h8M12 16v4" strokeLinecap="round" />
                  </svg>
                }
                title="All caught up"
                subtitle="No pending requests — Nori is resting."
              />
            ) : (
              <>
                {pendingIncoming.length > 0 && (
                  <section className="flex flex-col gap-3">
                    <SubSectionLabel dotClass="bg-accent-rose/60">Incoming — {pendingIncoming.length}</SubSectionLabel>
                    <ListPanel>
                      {pendingIncoming.map(req => (
                        <RequestItem
                          key={`${req.id}:${req._instanceOrigin}`}
                          request={req}
                          type="incoming"
                          onAccept={() => updateFriendRequest(req.id, 'accepted')}
                          onDecline={() => updateFriendRequest(req.id, 'declined')}
                        />
                      ))}
                    </ListPanel>
                  </section>
                )}
                {pendingOutgoing.length > 0 && (
                  <section className="flex flex-col gap-3">
                    <SubSectionLabel dotClass="bg-accent-amber/60">Outgoing — {pendingOutgoing.length}</SubSectionLabel>
                    <ListPanel>
                      {pendingOutgoing.map(req => (
                        <RequestItem
                          key={`${req.id}:${req._instanceOrigin}`}
                          request={req}
                          type="outgoing"
                          onCancel={() => cancelFriendRequest(req.id)}
                        />
                      ))}
                    </ListPanel>
                  </section>
                )}
              </>
            )}
          </section>
        );
      case 'add':
        return (
          <AddFriendTab
            onOpenDm={handleOpenDm}
          />
        );
      case 'activity': {
        const activeFriends: TaggedFriend[] = [];
        const idleFriends: TaggedFriend[] = [];
        const offlineActivityFriends: TaggedFriend[] = [];
        for (const f of friends) {
          if (f.status === 'offline') {
            offlineActivityFriends.push(f);
            continue;
          }
          const acts = userActivities.get(f.homeUserId ?? f.id) ?? [];
          const primary = getPrimaryActivity(acts);
          if (primary && primary.type !== 'custom') {
            activeFriends.push(f);
          } else {
            idleFriends.push(f);
          }
        }

        const renderActivityFriend = (friend: TaggedFriend, isOffline = false) => {
          const activities = userActivities.get(friend.homeUserId ?? friend.id) ?? [];
          const isRichActivity = !isOffline && hasRichActivity(activities);
          const primary = getPrimaryActivity(activities);
          const accentClass = primary ? getActivityAccentClass(primary.type) : '';
          return (
            <ActivityFriendItem
              key={friend.id}
              friend={friend}
              isOffline={isOffline}
              activities={activities}
              isRichActivity={isRichActivity}
              accentClass={accentClass}
              mobile={mobile}
              onMobileClick={(userId) => pushMobileScreen('user-profile', { userId })}
              onDmClick={handleOpenDm}
            />
          );
        };

        return (
          <section className="animate-fade-in flex flex-col gap-6">
            <SectionLabel dotClass="bg-accent-mint/80">Activity</SectionLabel>
            {activeFriends.length === 0 && idleFriends.length === 0 && offlineActivityFriends.length === 0 ? (
              <EmptyState
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-txt-tertiary/60">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <path d="M8 21h8M12 17v4" strokeLinecap="round" />
                  </svg>
                }
                title="Quiet for now"
                subtitle="When friends start an activity, it'll show up here."
              />
            ) : (
              <>
                {activeFriends.length > 0 && (
                  <section className="flex flex-col gap-3">
                    <SubSectionLabel dotClass="bg-accent-mint/70">Active — {activeFriends.length}</SubSectionLabel>
                    <ListPanel>
                      {activeFriends.map(f => renderActivityFriend(f))}
                    </ListPanel>
                  </section>
                )}
                {idleFriends.length > 0 && (
                  <section className="flex flex-col gap-3">
                    <SubSectionLabel dotClass="bg-status-idle/60">Online — {idleFriends.length}</SubSectionLabel>
                    <ListPanel>
                      {idleFriends.map(f => renderActivityFriend(f))}
                    </ListPanel>
                  </section>
                )}
                {offlineActivityFriends.length > 0 && (
                  <section className="flex flex-col gap-3">
                    <SubSectionLabel dotClass="bg-status-offline/50">Offline — {offlineActivityFriends.length}</SubSectionLabel>
                    <div className="opacity-60">
                      <ListPanel>
                        {offlineActivityFriends.map(f => renderActivityFriend(f, true))}
                      </ListPanel>
                    </div>
                  </section>
                )}
              </>
            )}
          </section>
        );
      }
    }
  };

  const popMobileScreen = useUIStore((s) => s.popMobileScreen);

  return (
    <div className="flex-1 flex flex-col bg-surface-chat h-full">
      {/* Header */}
      {mobile ? (
        <div className="h-12 px-3 flex items-center gap-2 border-b border-white/[0.05] flex-shrink-0 z-10 bg-surface-base">
          <button onClick={popMobileScreen} className="w-8 h-8 -ml-1.5 flex items-center justify-center rounded-lg text-txt-secondary hover:text-txt-primary hover:bg-white/[0.05] transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <span className="font-semibold text-[15px] tracking-[-0.01em] text-txt-primary">{t('friends')}</span>
        </div>
      ) : (
        <div className="flex-shrink-0 z-10 bg-surface-chat">
          <div className="mx-auto w-full max-w-[880px] px-5 sm:px-8 pt-11 pb-6">
            {/* Editorial hero */}
            <div className="flex items-end justify-between gap-6">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-txt-tertiary/60">
                  {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
                <h1 className="mt-3 text-[38px] sm:text-[42px] font-semibold text-txt-primary tracking-[-0.045em] leading-[1.02]">
                  {t(greetingKey)}.
                </h1>
                <p className="mt-2.5 text-[14px] tracking-[0.002em] text-txt-secondary/90">
                  {t('home_welcome_back').replace('{name}', heroName)}
                </p>
                <p className="mt-3 text-[12px] tracking-[0.006em] text-txt-tertiary/70">
                  {friends.length === 0 ? (
                    'Find people to connect with'
                  ) : (
                    <>
                      <span className="font-medium text-txt-secondary/90">{onlineFriends.length} online</span>
                      <span className="mx-1.5 text-txt-tertiary/40">·</span>
                      <span>{friends.length} total</span>
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* FRIENDS module header */}
            <div className="mt-11 border-t border-white/[0.05] pt-7">
              <div className="flex items-end justify-between gap-6">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-txt-tertiary/60">{t('friends')}</p>
                  <h2 className="mt-1.5 text-[20px] font-semibold text-txt-primary tracking-[-0.03em]">{t('friends_hero_desc')}</h2>
                </div>
                {/* Primary CTA */}
                <button
                  onClick={() => setActiveTab('add')}
                  className="group flex items-center gap-2 pl-3 pr-5 h-10 rounded-full bg-accent-primary text-white text-[13px] font-semibold tracking-[-0.005em] shadow-[0_8px_24px_-8px_rgb(var(--accent-primary-glow)/0.55)] transition-all duration-200 hover:bg-accent-primary-hover hover:shadow-[0_10px_28px_-8px_rgb(var(--accent-primary-glow)/0.65)] active:scale-[0.98] flex-shrink-0"
                >
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white/[0.14] transition-colors group-hover:bg-white/[0.22]">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="flex-shrink-0">
                      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                    </svg>
                  </span>
                  {t('add_friend')}
                </button>
              </div>
              {/* Tab rail */}
              <div className="mt-5 flex items-center justify-between gap-4 border-b border-white/[0.05]">
                <div className="flex items-center gap-1">
                  <TabButton active={activeTab === 'all'} onClick={() => setActiveTab('all')}>{t('all')}</TabButton>
                  <TabButton active={activeTab === 'online'} onClick={() => setActiveTab('online')}>{t('online')}</TabButton>
                  <TabButton active={activeTab === 'pending'} onClick={() => setActiveTab('pending')}>
                    {t('pending')}
                    {(pendingIncoming.length > 0) && (
                      <span className="ml-1 px-1.5 py-0.5 rounded-full bg-accent-rose/15 text-accent-rose text-[9.5px] font-semibold leading-none">
                        {pendingIncoming.length}
                      </span>
                    )}
                  </TabButton>
                  <TabButton active={activeTab === 'activity'} onClick={() => setActiveTab('activity')}>{t('activity')}</TabButton>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 pb-2.5">
                  <MemberListToggleButton />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile tab bar */}
      {mobile && (
        <div className="px-2 py-2 flex gap-1 bg-surface-base/60 border-b border-white/[0.05] flex-shrink-0">
          {(['online', 'all', 'pending', 'add', 'activity'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 h-8 rounded-lg text-[12px] font-medium text-center transition-all duration-200 ${
                activeTab === tab
                  ? 'bg-white/[0.08] text-txt-primary'
                  : 'text-txt-tertiary hover:text-txt-secondary'
              }`}
            >
              {tab === 'add' ? t('add_friend') : tab === 'activity' ? t('activity') : t(tab)}
              {tab === 'pending' && pendingIncoming.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-notification text-white rounded-full">
                  {pendingIncoming.length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Content column */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[880px] px-5 sm:px-8 pt-7 sm:pt-8 pb-20">
          {renderTabContent()}

          {recentDms.length > 0 && (
            <section className="mt-14 border-t border-white/[0.05] pt-8 animate-fade-in">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-txt-tertiary/60">{t('recent_dms')}</p>
              <h2 className="mt-1.5 text-[16px] font-semibold text-txt-primary tracking-[-0.02em]">{t('recent_dms_desc')}</h2>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {recentDms.map(dm => (
                  <RecentDmCard key={dm.id} dm={dm} currentUser={currentUser} onSelect={handleOpenRecentDm} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={pendingUnfriend !== null}
        onClose={() => setPendingUnfriend(null)}
        onConfirm={async () => {
          if (pendingUnfriend) {
            await removeFriend(pendingUnfriend.id);
            setPendingUnfriend(null);
          }
        }}
        title="Remove Friend"
        description={`Are you sure you want to remove ${pendingUnfriend?.name ?? 'this user'} as a friend? You can always send them a new friend request later.`}
        confirmLabel="Remove"
        variant="danger"
      />
    </div>
  );
}

// ─── Add Friend Tab ─────────────────────────────────────────────────────────

function AddFriendTab({
  onOpenDm,
}: {
  onOpenDm: (userId: string, homeUserId?: string, homeInstance?: string | null) => void;
}) {
  const searchUsers = useSocialStore((s) => s.searchUsers);
  const sendFriendRequest = useSocialStore((s) => s.sendFriendRequest);
  const friends = useSocialStore((s) => s.friends);
  const requests = useSocialStore((s) => s.requests);
  const currentUser = useAuthStore((s) => s.user);
  const instances = useInstanceStore((s) => s.instances);
  const addToast = useUIStore((s) => s.addToast);

  const discoverUsers = useDiscoverStore((s) => s.users);
  const discoverLoading = useDiscoverStore((s) => s.isLoading);
  const fetchDiscoverUsers = useDiscoverStore((s) => s.fetchUsers);
  const updateRelationship = useDiscoverStore((s) => s.updateRelationship);

  const [query, setQuery] = useState(() => {
    // Consume the federation store's pending friend-add prefill at mount so
    // a Retry click in the Connections panel lands here with the original
    // target already in the input. The consume call clears the store value
    // so subsequent mounts (e.g. tab switching) start empty.
    return useFederationStore.getState().consumePendingFriendAddPrefill() ?? '';
  });
  const [rawSearchResults, setRawSearchResults] = useState<TaggedUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [directAddLoading, setDirectAddLoading] = useState(false);

  // Fetch discover on mount
  useEffect(() => {
    fetchDiscoverUsers();
  }, [fetchDiscoverUsers]);

  // Debounced search with race condition guard
  useEffect(() => {
    if (!query.trim()) {
      setRawSearchResults([]);
      setSearchLoading(false);
      return;
    }
    let isActive = true;
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      const results = await searchUsers(query.trim());
      if (isActive) {
        setRawSearchResults(results);
        setSearchLoading(false);
      }
    }, 300);
    return () => { isActive = false; clearTimeout(timer); };
  }, [query, searchUsers]);

  // Self-exclusion set
  const selfIds = useMemo(() => {
    const ids = new Set<string>();
    if (currentUser?.id) ids.add(`${currentUser.id}:`);
    for (const inst of instances) {
      if (inst.user?.id) ids.add(`${inst.user.id}:${inst.origin}`);
    }
    return ids;
  }, [currentUser?.id, instances]);

  const isSearchMode = query.trim().length > 0;

  // Enrich search results with friend/request status at render time
  const enrichedSearchResults: TaggedDiscoverUser[] = useMemo(() => {
    if (!isSearchMode) return [];
    return rawSearchResults
      .filter(u => !selfIds.has(`${u.id}:${u._instanceOrigin}`))
      .map(user => {
        const isFriend = friends.some(f => f.id === user.id && f._instanceOrigin === user._instanceOrigin);
        if (isFriend) {
          return { ...user, relationship: 'friends' as const, mutualFriendCount: 0, mutualSpaceCount: 0 };
        }
        const outbound = requests.find(r => r.status === 'pending' && r.user?.id === r.toId && r.user?.id === user.id && r._instanceOrigin === user._instanceOrigin);
        if (outbound) {
          return { ...user, relationship: 'outbound_pending' as const, requestId: outbound.id, mutualFriendCount: 0, mutualSpaceCount: 0 };
        }
        const inbound = requests.find(r => r.status === 'pending' && r.user?.id === r.fromId && r.user?.id === user.id && r._instanceOrigin === user._instanceOrigin);
        if (inbound) {
          return { ...user, relationship: 'inbound_pending' as const, requestId: inbound.id, mutualFriendCount: 0, mutualSpaceCount: 0 };
        }
        return { ...user, relationship: 'none' as const, mutualFriendCount: 0, mutualSpaceCount: 0 };
      });
  }, [rawSearchResults, friends, requests, selfIds, isSearchMode]);

  const trimmedQuery = query.trim();
  const directAt = trimmedQuery.lastIndexOf('@');
  // Allow bare handle (no @) or @ at non-edge position; hide @, @bob, bob@.
  const showDirectAdd = trimmedQuery.length > 0
    && (directAt === -1 || (directAt > 0 && directAt < trimmedQuery.length - 1));
  // Bare handle gets the home host appended for display only — submission
  // still uses the raw trimmed query.
  const directAddDisplay = directAt === -1
    ? `${trimmedQuery}@${window.location.host}`
    : trimmedQuery;

  // Direct Add handler
  const handleDirectAdd = async () => {
    setDirectAddLoading(true);
    try {
      await sendFriendRequest(query.trim());
      addToast('Friend request sent!', 'success');
      setQuery('');
    } catch (err) {
      // The shared API client throws `new Error(body.error)` for non-2xx
      // responses (api/client.ts:298), so `err.message` carries the server's
      // error code (e.g. 'peer_pending_approval'). It also doubles as fallback
      // text if the code is unrecognized by mapServerErrorToMessage.
      const code = err instanceof Error ? err.message : undefined;
      addToast(mapServerErrorToMessage(code, code, query.trim()), 'warning');
    } finally {
      setDirectAddLoading(false);
    }
  };

  // No-op relationship change for search mode cards (useMemo re-derives from store)
  const noopRelationshipChange = useCallback(() => {}, []);

  // Determine which list to display
  const displayUsers = isSearchMode ? enrichedSearchResults : discoverUsers;
  const displayLoading = isSearchMode ? searchLoading : discoverLoading;
  const emptyLabel = isSearchMode
    ? 'No users match your search.'
    : 'No discoverable users yet — invite people to join!';

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      {/* Search section */}
      <section className="flex flex-col gap-2.5">
        <h2 className="text-[18px] font-semibold text-txt-primary tracking-[-0.02em]">Add a friend</h2>
        <p className="text-[12.5px] text-txt-tertiary leading-relaxed">
          Search by username or paste <span className="font-medium text-txt-secondary/80">user@instance</span> to send a direct request.
        </p>
      </section>

      {/* Search input — focused, clean */}
      <div className="relative">
        <input
          type="text"
          placeholder="Enter a username..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full h-11 pl-11 pr-10 bg-white/[0.03] text-txt-primary placeholder:text-txt-tertiary/50 rounded-xl border border-white/[0.06] focus:bg-white/[0.04] focus:border-accent-primary/40 focus:ring-2 focus:ring-accent-primary/15 focus:outline-none transition-all duration-200 text-[13.5px]"
        />
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-txt-tertiary/60" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md text-txt-tertiary/60 hover:text-txt-secondary hover:bg-white/[0.05] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Direct Add action row */}
      {showDirectAdd && (
        <div className="rounded-xl bg-accent-primary/[0.05] border border-accent-primary/15 p-3.5 flex items-center gap-3 animate-fade-in">
          <div className="w-9 h-9 rounded-lg bg-accent-primary/15 flex items-center justify-center flex-shrink-0">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-accent-primary">
              <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <path d="M20 8v6M23 11h-6" />
            </svg>
          </div>
          <div className="flex-1 min-w-0 text-[13px] text-txt-secondary">
            Send request to <span className="font-medium text-txt-primary">{directAddDisplay}</span>
          </div>
          <button
            onClick={handleDirectAdd}
            disabled={directAddLoading}
            className="px-4 py-2 rounded-lg bg-accent-primary hover:bg-accent-primary-hover text-white text-[12.5px] font-medium transition-colors disabled:opacity-50 flex-shrink-0"
          >
            {directAddLoading ? 'Sending...' : 'Send Request'}
          </button>
        </div>
      )}

      {/* Section divider label */}
      {!isSearchMode && discoverUsers.length > 0 && (
        <div className="flex items-center gap-2.5 px-1">
          <span className="w-[3px] h-3.5 rounded-full bg-accent-primary/50" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-txt-tertiary/60">People you may know</span>
        </div>
      )}

      {/* Results grid */}
      {displayLoading && displayUsers.length === 0 ? (
        <div className="flex items-center justify-center h-44">
          <LoadingSpinner />
        </div>
      ) : displayUsers.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.05] flex items-center justify-center mb-3">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-txt-tertiary/50">
              <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="8.5" cy="7" r="4" />
              <path d="M20 8v6M23 11h-6" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-[12.5px] text-txt-tertiary/70">{emptyLabel}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {isSearchMode
            ? enrichedSearchResults.map((user) => (
                <UserDiscoverCard
                  key={`${user.id}:${user._instanceOrigin}`}
                  user={user}
                  onOpenDm={onOpenDm}
                  onRelationshipChange={noopRelationshipChange}
                />
              ))
            : discoverUsers.map((user) => (
                <UserDiscoverCard
                  key={`${user.id}:${user._instanceOrigin}`}
                  user={user}
                  onOpenDm={onOpenDm}
                  onRelationshipChange={updateRelationship}
                />
              ))
          }
        </div>
      )}
    </div>
  );
}

// ─── User Discover Card ─────────────────────────────────────────────────────

function UserDiscoverCard({
  user,
  onOpenDm,
  onRelationshipChange,
}: {
  user: TaggedDiscoverUser;
  onOpenDm: (userId: string, homeUserId?: string, homeInstance?: string | null) => void;
  onRelationshipChange: (userId: string, origin: string, relationship: TaggedDiscoverUser['relationship'], requestId?: string) => void;
}) {
  const sendFriendRequest = useSocialStore((s) => s.sendFriendRequest);
  const updateFriendRequest = useSocialStore((s) => s.updateFriendRequest);
  const openModal = useUIStore((s) => s.openModal);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  const baseName = user.username.includes('@') ? user.username.split('@')[0]! : user.username;
  const displayName = user.displayName ?? baseName;
  const gradient = getAvatarGradient(user.homeUserId ?? user.id, displayName, user.avatarColor);
  const originLabel = user._instanceOrigin
    ? (() => { try { return new URL(user._instanceOrigin).host; } catch { return user._instanceOrigin; } })()
    : null;

  const avatarUrl = user.avatar
    ? (user.avatar.startsWith('http') || user.avatar.startsWith('/') ? user.avatar : `/api/uploads/${user.avatar}`)
    : null;
  const bannerUrl = user.banner
    ? (user.banner.startsWith('http') || user.banner.startsWith('/') ? user.banner : `/api/uploads/${user.banner}`)
    : null;

  const handleSendRequest = async () => {
    setActionLoading(true);
    setError('');
    const username = user._instanceOrigin ? baseName + '@' + (originLabel ?? '') : baseName;
    try {
      const requestId = await sendFriendRequest(username);
      onRelationshipChange(user.id, user._instanceOrigin, 'outbound_pending', requestId);
    } catch (err) {
      // See handleDirectAdd above — err.message is the server error code.
      const code = err instanceof Error ? err.message : undefined;
      setError(mapServerErrorToMessage(code, code ?? 'Failed to send request', username));
    } finally {
      setActionLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!user.requestId) return;
    setActionLoading(true);
    setError('');
    try {
      await updateFriendRequest(user.requestId, 'accepted');
      onRelationshipChange(user.id, user._instanceOrigin, 'friends');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept request');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!user.requestId) return;
    setActionLoading(true);
    setError('');
    try {
      await updateFriendRequest(user.requestId, 'declined');
      onRelationshipChange(user.id, user._instanceOrigin, 'none');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decline request');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!user.requestId) return;
    setActionLoading(true);
    setError('');
    try {
      const origin = user._instanceOrigin;
      const client = origin
        ? (useInstanceStore.getState().instances.find(i => i.origin === origin)?.api ?? api)
        : api;
      await client.social.cancelRequest(user.requestId);
      onRelationshipChange(user.id, user._instanceOrigin, 'none');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel request');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenProfile = () => {
    openModal('userProfile', { userId: user.id, user, origin: user._instanceOrigin });
  };

  const handleMessage = () => {
    onOpenDm(user.id, user.homeUserId ?? undefined, user.homeInstance);
  };

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-surface-base/70 transition-colors duration-200 hover:border-white/[0.12]">
      {/* Banner area */}
      <div className="h-16 relative overflow-hidden">
        {bannerUrl ? (
          <img src={bannerUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0" style={{ background: gradient.gradient }} />
        )}
        <div
          className="absolute bottom-0 inset-x-0 h-10"
          style={{ background: 'linear-gradient(to top, rgba(14,14,20,0.9), transparent)' }}
        />
        {originLabel && (
          <div className="absolute top-2 right-2 z-[2]">
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-semibold backdrop-blur-sm bg-black/40 text-txt-secondary border border-white/[0.08]">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" className="opacity-60">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
              </svg>
              {originLabel}
            </span>
          </div>
        )}
      </div>

      {/* Overlapping avatar */}
      <div className="relative px-4 -mt-6 z-10">
        <button onClick={handleOpenProfile} className="block">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-11 h-11 rounded-full object-cover ring-[3px] ring-surface-base shadow-elevation-high"
            />
          ) : (
            <div
              className="w-11 h-11 rounded-full ring-[3px] ring-surface-base shadow-elevation-high flex items-center justify-center text-base font-bold text-white/90"
              style={{ background: gradient.gradient }}
            >
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="px-4 pt-2 pb-4 flex flex-col flex-1">
        <button onClick={handleOpenProfile} className="text-left group/name">
          <h3 className="text-[13.5px] font-semibold text-txt-primary tracking-[-0.01em] truncate group-hover/name:underline decoration-txt-tertiary/50 underline-offset-2">{displayName}</h3>
          <p className="text-[11.5px] text-txt-tertiary truncate mt-0.5">@{user.username}</p>
        </button>

        {user.bio && (
          <p className="text-[12px] text-txt-secondary leading-relaxed line-clamp-2 mt-2 flex-1">{user.bio}</p>
        )}
        {!user.bio && <div className="flex-1" />}

        {/* Mutuals */}
        {(user.mutualFriendCount > 0 || user.mutualSpaceCount > 0) && (
          <div className="flex items-center gap-2 text-[11px] text-txt-tertiary mt-2.5 mb-3">
            {user.mutualFriendCount > 0 && (
              <span>{user.mutualFriendCount} mutual {user.mutualFriendCount === 1 ? 'friend' : 'friends'}</span>
            )}
            {user.mutualFriendCount > 0 && user.mutualSpaceCount > 0 && (
              <span className="text-txt-tertiary/40">·</span>
            )}
            {user.mutualSpaceCount > 0 && (
              <span>{user.mutualSpaceCount} mutual {user.mutualSpaceCount === 1 ? 'space' : 'spaces'}</span>
            )}
          </div>
        )}
        {user.mutualFriendCount === 0 && user.mutualSpaceCount === 0 && <div className="mt-2" />}

        {/* Error */}
        {error && (
          <div className="text-[11px] text-txt-danger mb-1.5 truncate">{error}</div>
        )}

        {/* Action button */}
        {user.relationship === 'none' && (
          <button
            onClick={handleSendRequest}
            disabled={actionLoading}
            className="w-full h-8 rounded-lg bg-accent-primary hover:bg-accent-primary-hover text-white text-[12.5px] font-semibold transition-colors disabled:opacity-50 flex items-center justify-center"
          >
            {actionLoading ? 'Sending...' : 'Send Friend Request'}
          </button>
        )}
        {user.relationship === 'outbound_pending' && (
          <button
            onClick={handleCancelRequest}
            disabled={actionLoading || !user.requestId}
            className="w-full h-8 rounded-lg bg-accent-amber/10 hover:bg-accent-amber/20 text-accent-amber text-[12.5px] font-semibold transition-colors disabled:opacity-50"
          >
            {actionLoading ? 'Cancelling...' : 'Request Pending'}
          </button>
        )}
        {user.relationship === 'inbound_pending' && (
          <div className="flex gap-2">
            <button
              onClick={handleAccept}
              disabled={actionLoading}
              className="flex-1 h-8 rounded-lg bg-status-online/15 hover:bg-status-online/30 text-status-online text-[12.5px] font-semibold transition-colors disabled:opacity-50"
            >
              Accept
            </button>
            <button
              onClick={handleDecline}
              disabled={actionLoading}
              className="flex-1 h-8 rounded-lg bg-white/[0.04] hover:bg-accent-rose/15 text-txt-secondary hover:text-txt-danger text-[12.5px] font-semibold transition-colors disabled:opacity-50"
            >
              Decline
            </button>
          </div>
        )}
        {user.relationship === 'friends' && (
          <button
            onClick={handleMessage}
            className="w-full h-8 rounded-lg bg-accent-mint/10 hover:bg-accent-mint/20 text-accent-mint text-[12.5px] font-semibold transition-colors"
          >
            Message
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Shared Components ──────────────────────────────────────────────────────

function SectionLabel({ dotClass, children }: { dotClass: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-1">
      <span className={`h-px w-4 rounded-full ${dotClass}`} />
      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-txt-tertiary/60">{children}</span>
    </div>
  );
}

function SubSectionLabel({ dotClass, children }: { dotClass: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <span className={`w-[3px] h-3 rounded-full ${dotClass}`} />
      <span className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-txt-tertiary/60">{children}</span>
    </div>
  );
}

function ListPanel({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-0.5">{children}</div>;
}

function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-20 animate-fade-in">
      <div className="w-11 h-11 rounded-2xl bg-white/[0.025] border border-white/[0.05] flex items-center justify-center mb-5">
        {icon}
      </div>
      <p className="text-[13.5px] font-medium text-txt-secondary/90 tracking-[-0.005em]">{title}</p>
      {subtitle && (
        <p className="text-[12px] text-txt-tertiary/70 mt-1.5 max-w-[260px] leading-relaxed">{subtitle}</p>
      )}
    </div>
  );
}

function TabButton({ children, active, onClick }: { children: React.ReactNode, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 px-3.5 pt-1 pb-3 text-[12.5px] font-medium tracking-[0.01em] transition-colors duration-200 active:scale-[0.98] ${
        active
          ? 'text-txt-primary'
          : 'text-txt-tertiary/70 hover:text-txt-secondary'
      }`}
    >
      {children}
      <span className={`absolute left-3.5 right-3.5 -bottom-px h-[2px] rounded-full bg-accent-primary transition-opacity duration-200 ${active ? 'opacity-100' : 'opacity-0'}`} />
    </button>
  );
}

function FriendItem({ friend, onRemove, onDm }: { friend: TaggedFriend, onRemove: () => void, onDm: () => void }) {
  const canonical = useCanonicalUserView(friend as unknown as User);
  const instanceLabel = friend._instanceOrigin ? (() => { try { return new URL(friend._instanceOrigin).host; } catch { return friend._instanceOrigin; } })() : '';
  const { baseName: friendBaseName, domain } = parseFederatedUsername(canonical.username);
  const friendDisplayName = canonical.displayName ?? friendBaseName;
  const isOffline = canonical.status === 'offline';

  const { t } = useLanguage();
  const me = useAuthStore((s) => s.user);
  const openUserProfile = useUIStore((s) => s.openUserProfile);
  const openContextMenu = useContextMenuStore((s) => s.open);
  const friends = useSocialStore((s) => s.friends);
  const requests = useSocialStore((s) => s.requests);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openContextMenu(
      { x: e.clientX, y: e.clientY },
      buildUserContextMenuItems({
        user: canonical,
        me,
        friends,
        requests,
        t,
        onViewProfile: (u) => openUserProfile(u, pointAnchor(e.clientX, e.clientY), 'left'),
        onRemoveFriend: onRemove,
      }),
    );
  }, [canonical, me, friends, requests, t, openContextMenu, openUserProfile, onRemove]);

  return (
    <div className="group flex items-center justify-between gap-3 px-4 py-4 rounded-2xl border border-white/[0.05] bg-white/[0.015] transition-all duration-200 hover:border-white/[0.12] hover:bg-white/[0.03]" onContextMenu={handleContextMenu}>
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        <Avatar
          src={canonical.avatar}
          name={friendDisplayName}
          size={44}
          status={canonical.status}
          className={`flex-shrink-0 transition-opacity duration-200 ${isOffline ? 'opacity-50' : ''}`}
          userId={canonical.homeUserId ?? canonical.id}
          avatarColor={canonical.avatarColor}
        />
        <div className="flex flex-col min-w-0 gap-1">
          <div className="flex items-center gap-2 min-w-0">
            <Username
              username={friendDisplayName}
              className={`text-[14px] leading-[1.25] font-semibold tracking-[-0.01em] truncate ${isOffline ? 'text-txt-tertiary' : 'text-txt-primary'}`}
            />
            {domain && isFederationGlobeApplicable(canonical) && (
              <span className="text-[10px] text-txt-tertiary/55 font-normal flex-shrink-0 max-w-[120px] truncate">via {domain}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`text-[11.5px] font-normal ${isOffline ? 'text-txt-tertiary/50' : 'text-txt-secondary/80'}`}>
              {statusLabel[friend.status] ?? friend.status}
            </span>
            {instanceLabel && (
              <>
                <span className="text-[9px] text-txt-tertiary/30">·</span>
                <span className="text-[10.5px] text-txt-tertiary/50 truncate">{instanceLabel}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 pl-2 flex-shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onDm(); }}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-txt-tertiary/60 hover:text-txt-primary hover:bg-white/[0.06] transition-colors"
          title="Message"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-txt-tertiary/40 hover:text-txt-danger hover:bg-accent-rose/10 transition-colors"
          title="Remove Friend"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function RequestItem({ request, type, onAccept, onDecline, onCancel }: {
  request: TaggedFriendRequest;
  type: 'incoming' | 'outgoing';
  onAccept?: () => void;
  onDecline?: () => void;
  onCancel?: () => void;
}) {
  const rawUser = request.user;
  const _FALLBACK_USER = { id: '', username: '', createdAt: 0, isAdmin: false, replicatedInstances: [] } as unknown as User;
  const canonicalUser = useCanonicalUserView((rawUser as unknown as User | null) ?? _FALLBACK_USER);
  const user = rawUser ? canonicalUser : null;
  if (!user) return null;
  const instanceLabel = request._instanceOrigin ? (() => { try { return new URL(request._instanceOrigin).host; } catch { return request._instanceOrigin; } })() : '';
  const { baseName: reqBaseName, domain } = parseFederatedUsername(user.username);
  const reqDisplayName = user.displayName ?? reqBaseName;
  const isIncoming = type === 'incoming';

  return (
    <div className="group flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl transition-colors duration-150 hover:bg-white/[0.045]">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Avatar
          src={user.avatar}
          name={reqDisplayName}
          size={36}
          status={user.status as any}
          className="flex-shrink-0 opacity-70"
          userId={user.homeUserId ?? user.id}
          avatarColor={user.avatarColor}
        />
        <div className="flex flex-col min-w-0 gap-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium text-[13.5px] leading-[1.25] tracking-[-0.01em] text-txt-primary truncate">{reqDisplayName}</span>
            {domain && isFederationGlobeApplicable(user) && (
              <span className="text-[10px] text-txt-tertiary/55 font-normal flex-shrink-0 max-w-[120px] truncate">via {domain}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`text-[11px] font-medium ${isIncoming ? 'text-accent-rose/90' : 'text-accent-amber/90'}`}>
              {isIncoming ? 'Wants to be friends' : 'Request sent'}
            </span>
            {instanceLabel && (
              <>
                <span className="text-[9px] text-txt-tertiary/30">·</span>
                <span className="text-[10.5px] text-txt-tertiary/50 truncate">{instanceLabel}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 pl-2 flex-shrink-0">
        {isIncoming ? (
          <>
            <button
              onClick={() => onAccept?.()}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-accent-mint/10 text-accent-mint hover:bg-accent-mint hover:text-[#0b0b10] transition-all"
              title="Accept"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
            <button
              onClick={() => onDecline?.()}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-txt-tertiary/50 hover:text-txt-danger hover:bg-accent-rose/10 transition-colors"
              title="Decline"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </>
        ) : (
          <button
            onClick={() => onCancel?.()}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-txt-tertiary/50 hover:text-txt-danger hover:bg-accent-rose/10 transition-colors"
            title="Cancel Request"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Recent Conversation Card ────────────────────────────────────────────────

const _RECENT_FALLBACK_USER = { id: '', username: '', createdAt: 0, isAdmin: false, replicatedInstances: [] } as unknown as User;

function RecentDmCard({ dm, currentUser, onSelect }: { dm: DmChannel; currentUser: User | null; onSelect: (id: string) => void }) {
  const isGroup = !!dm.ownerId;
  const otherMembers = dm.members.filter(m => !isSelf(m, currentUser));
  const rawFirstOther = isGroup ? null : (otherMembers[0] ?? null);
  const firstOtherCanonical = useCanonicalUserView(rawFirstOther ?? currentUser ?? _RECENT_FALLBACK_USER);
  const displayName = isGroup
    ? formatDmHeaderName(dm, currentUser)
    : firstOtherCanonical.displayName ?? parseFederatedUsername(firstOtherCanonical.username).baseName;
  const preview = formatDmSidebarPreview(dm, currentUser) ?? (isGroup ? `${dm.members.length} members` : null);
  const timestamp = dm.lastMessage ? formatDmTimestamp(dm.lastMessage.createdAt) : '';

  return (
    <button
      onClick={() => onSelect(dm.id)}
      className="group flex items-center gap-3.5 px-4 py-3.5 rounded-2xl border border-white/[0.05] bg-white/[0.015] hover:border-white/[0.12] hover:bg-white/[0.03] transition-colors duration-200 text-left"
    >
      {isGroup ? (
        <AvatarStack members={otherMembers} size={36} border="channel" iconUrl={dm.icon} />
      ) : (
        <Avatar
          src={firstOtherCanonical.avatar}
          name={firstOtherCanonical.displayName ?? parseFederatedUsername(firstOtherCanonical.username).baseName}
          size={36}
          status={firstOtherCanonical.status as any}
          className="flex-shrink-0"
          userId={firstOtherCanonical.homeUserId ?? firstOtherCanonical.id}
          avatarColor={firstOtherCanonical.avatarColor}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13.5px] font-semibold text-txt-primary tracking-[-0.01em] truncate">{displayName}</span>
          {timestamp && (
            <span className="text-[10.5px] text-txt-tertiary/60 flex-shrink-0">{timestamp}</span>
          )}
        </div>
        {preview && (
          <p className="text-[11.5px] text-txt-tertiary/80 truncate mt-0.5">{preview}</p>
        )}
      </div>
    </button>
  );
}
import React, { useEffect, useState, useCallback, useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import type { User } from '@backspace/shared';
import { Avatar } from '../ui/Avatar';
import { Username } from '../ui/Username';
import { useProfileCardFX } from '../ui/useProfileCardFX';
import { CountUp } from '../../utils/CountUp';
import { useUIStore } from '../../stores/uiStore';
import { useSpaceStore, getApiForOrigin, resolveUserOrigin } from '../../stores/spaceStore';
import { api } from '../../api/client';
import { useSocialStore, type TaggedFriend, type TaggedFriendRequest } from '../../stores/socialStore';
import { SpotifyVinylBlock } from '../spotify/SpotifyVinylBlock';
import { mapServerErrorToMessage } from '../../utils/friendErrors';
import { useAuthStore } from '../../stores/authStore';
import { getAvatarGradient, getSpaceGradient, adjustColor, mutedGradient } from '../../utils/gradients';
import { parseFederatedUsername, isSelf, canonicalUserMatch } from '../../utils/identity';
import { loadFederatedMutuals, type TaggedMutualFriend, type MutualSpace } from '../../utils/mutuals';
import { StaffBadge, NetrexChip } from '../ui/StaffBadge';
import { ProfileBoardTab } from '../profile/board/ProfileBoardTab';
import { useLanguage } from '../../contexts/LanguageContext';

type Tab = 'about' | 'board' | 'friends' | 'spaces';

type FriendshipStatus =
  | { state: 'self' }
  | { state: 'friends'; friend: TaggedFriend }
  | { state: 'outbound_pending'; request: TaggedFriendRequest }
  | { state: 'inbound_pending'; request: TaggedFriendRequest }
  | { state: 'none' };

function getFriendshipStatus(
  viewedUser: User,
  currentUser: User | null,
  friends: TaggedFriend[],
  requests: TaggedFriendRequest[],
): FriendshipStatus {
  if (!currentUser) return { state: 'none' };
  if (isSelf(viewedUser, currentUser)) return { state: 'self' };

  const friend = friends.find(f => canonicalUserMatch(f, viewedUser));
  if (friend) return { state: 'friends', friend };

  const request = requests.find(r =>
    r.user && canonicalUserMatch(r.user, viewedUser)
  );
  if (request?.user) {
    // request.user is the OTHER party. If their ID === toId, then I am fromId (outbound)
    const isOutbound = request.user.id === request.toId;
    return isOutbound
      ? { state: 'outbound_pending', request }
      : { state: 'inbound_pending', request };
  }

  return { state: 'none' };
}

/**
 * Sliding tab indicator: measures the active tab button and positions the
 * accent pill under it with a transform transition. Re-measures on tab
 * change, mutuals load (counts change tab widths) and resize.
 */
function useSlidingIndicator(
  activeTab: string,
  loadingMutuals: boolean,
) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const tabsWrapRef = useRef<HTMLDivElement | null>(null);

  const update = useCallback(() => {
    const wrap = tabsWrapRef.current;
    const bar = barRef.current;
    if (!wrap || !bar) return;
    const active = wrap.querySelector<HTMLButtonElement>(`[data-tab-key='${activeTab}']`);
    if (!active) return;
    bar.style.width = `${active.offsetWidth}px`;
    bar.style.transform = `translateX(${active.offsetLeft}px)`;
  }, [activeTab]);

  useLayoutEffect(() => {
    update();
    const wrap = tabsWrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [update, loadingMutuals]);

  return { barRef, tabsWrapRef };
}

export function UserProfileModal() {
  const activeModal = useUIStore((s) => s.activeModal);
  const modalData = useUIStore((s) => s.modalData);
  const closeModal = useUIStore((s) => s.closeModal);
  const addToast = useUIStore((s) => s.addToast);
  const navigate = useNavigate();
  const addDmChannel = useSpaceStore((s) => s.addDmChannel);
  const friends = useSocialStore((s) => s.friends);
  const requests = useSocialStore((s) => s.requests);
  const sendFriendRequest = useSocialStore((s) => s.sendFriendRequest);
  const removeFriend = useSocialStore((s) => s.removeFriend);
  const updateFriendRequest = useSocialStore((s) => s.updateFriendRequest);
  const cancelFriendRequest = useSocialStore((s) => s.cancelFriendRequest);
  const currentUser = useAuthStore((s) => s.user);

  const [user, setUser] = useState<User | null>(null);
  const [userOrigin, setUserOrigin] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('about');
  const [mutualFriends, setMutualFriends] = useState<TaggedMutualFriend[]>([]);
  const [mutualSpaces, setMutualSpaces] = useState<MutualSpace[]>([]);
  const [loadingMutuals, setLoadingMutuals] = useState(false);
  const [friendActionLoading, setFriendActionLoading] = useState(false);
  const [profileAccent, setProfileAccent] = useState<string | null>(null);
  // Last value actually persisted to the server. Lets the picker update local
  // state freely while dragging (zero network) and commit exactly one PUT on
  // release/blur — even if both pointerup and blur fire.
  const savedAccentRef = useRef<string | null>(null);

  // “Listening now” — one shared block for every profile surface, with the
  // exact lookup the activity panel uses (same store, same key). Must be
  // mounted unconditionally — the block itself guards the null-user case.
  const isSelfProfile = !!(user && currentUser && (user.id === currentUser.id || (user.homeUserId && user.homeUserId === (currentUser.homeUserId ?? currentUser.id))));
  const profileUserId = (modalData?.userId as string | undefined) ?? (user?.homeUserId ?? user?.id) ?? '';

  const isOpen = activeModal === 'userProfile';
  const userId = modalData?.userId as string | undefined;
  const passedUser = modalData?.user as User | undefined;
  const passedOrigin = (modalData?.origin as string | undefined) ?? '';

  // Determine friendship status (federation-safe canonical matching)
  const friendship: FriendshipStatus = user
    ? getFriendshipStatus(user, currentUser, friends, requests)
    : { state: 'none' };

  const loadUser = useCallback(async (id: string, origin: string) => {
    try {
      const targetApi = getApiForOrigin(origin);
      const u = await targetApi.users.get(id);
      setUser(u);
      setProfileAccent(u.profileAccent ?? null);
      savedAccentRef.current = u.profileAccent ?? null;
      useSpaceStore.getState().upsertUserView(u, origin);
    } catch {
      // User not found
    }
  }, []);

  const loadMutuals = useCallback(async (id: string, targetUser?: User) => {
    setLoadingMutuals(true);
    try {
      const data = await loadFederatedMutuals(id, targetUser?.homeUserId);
      setMutualFriends(data.mutualFriends);
      setMutualSpaces(data.mutualSpaces);
    } catch {
      setMutualFriends([]);
      setMutualSpaces([]);
    } finally {
      setLoadingMutuals(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && userId) {
      setActiveTab('about');
      const origin = passedOrigin || (passedUser ? resolveUserOrigin(passedUser) : '');
      setUserOrigin(origin);
      // Use the passed user directly (avoids 404 for federated users on local API)
      if (passedUser) {
        setUser(passedUser);
        setProfileAccent(passedUser.profileAccent ?? null);
        savedAccentRef.current = passedUser.profileAccent ?? null;
      } else {
        loadUser(userId, origin);
      }
      loadMutuals(userId, passedUser);
    }
  }, [isOpen, userId, passedUser, passedOrigin, loadUser, loadMutuals]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setUser(null);
      setUserOrigin('');
      setMutualFriends([]);
      setMutualSpaces([]);
      setProfileAccent(null);
      savedAccentRef.current = null;
    }
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, closeModal]);

  // Hooks MUST run unconditionally — calling these after the early return
  // below changed the hook count between renders and crashed React.
  const fx = useProfileCardFX();
  const { t } = useLanguage();
  const boardTabLabel = t('board_tab');
  const { barRef, tabsWrapRef } = useSlidingIndicator(activeTab, loadingMutuals);

  // Persist the personal profile tint (self profile only). Optimistic: apply
  // locally first, roll back on failure with a toast. Skips the request when
  // the value is already saved (dedupes pointerup + blur commits to one PUT).
  // Hook MUST run unconditionally — calling this after the early return below
  // changed the hook count between renders and crashed React.
  const handleProfileAccentChange = useCallback(async (hex: string | null) => {
    const prev = savedAccentRef.current;
    setProfileAccent(hex);
    if (hex === prev) return;
    try {
      await api.users.update({ profileAccent: hex ?? '' });
      savedAccentRef.current = hex;
    } catch (err) {
      setProfileAccent(prev);
      addToast((err as Error).message || 'Could not save profile color', 'warning');
    }
  }, [addToast]);

  if (!isOpen || !user) return null;

  const { baseName, domain } = parseFederatedUsername(user.username);
  const displayName = user.displayName ?? baseName;

  // Banner — use correct API client for remote users
  const profileApi = getApiForOrigin(userOrigin);
  const bannerSrc = user.banner
    ? (user.banner.startsWith('http') ? user.banner : profileApi.uploads.url(user.banner))
    : null;
  const bannerFallback = user.accentColor
    ? mutedGradient(user.accentColor, adjustColor(user.accentColor, -40))
    : (() => {
        const g = getAvatarGradient(user.homeUserId ?? user.id, displayName, user.avatarColor);
        return mutedGradient(g.from, g.to);
      })();

  const handleSendMessage = async () => {
    try {
      const existing = useSpaceStore.getState().findExistingDmForUser(user);
      if (existing) {
        useUIStore.getState().setShowDms(true);
        closeModal();
        navigate(`/channels/@me/${existing.dm.id}`);
        return;
      }
      const channel = await api.dm.create({
        userId: user.homeInstance ? undefined : user.id,
        homeUserId: user.homeUserId ?? undefined,
        homeInstance: user.homeInstance ?? undefined,
      });
      addDmChannel(channel);
      useUIStore.getState().setShowDms(true);
      closeModal();
      navigate(`/channels/@me/${channel.id}`);
    } catch (err) {
      console.error('Failed to create DM channel:', err);
    }
  };

  const handleAddFriend = async () => {
    setFriendActionLoading(true);
    try {
      await sendFriendRequest(user.username);
    } catch (err) {
      // The shared API client throws `new Error(body.error)` for non-2xx
      // responses (api/client.ts:298), so err.message carries the server's
      // error code (e.g. 'peer_pending_approval').
      const code = err instanceof Error ? err.message : undefined;
      addToast(mapServerErrorToMessage(code, code, user.username), 'warning');
    } finally {
      setFriendActionLoading(false);
    }
  };

  const handleRemoveFriend = async () => {
    if (friendship.state !== 'friends') return;
    setFriendActionLoading(true);
    try { await removeFriend(friendship.friend.id); }
    catch (err) { addToast((err as Error).message, 'warning'); }
    finally { setFriendActionLoading(false); }
  };

  const handleCancelRequest = async () => {
    if (friendship.state !== 'outbound_pending') return;
    setFriendActionLoading(true);
    try { await cancelFriendRequest(friendship.request.id); }
    catch (err) { addToast((err as Error).message, 'warning'); }
    finally { setFriendActionLoading(false); }
  };

  const handleAcceptRequest = async () => {
    if (friendship.state !== 'inbound_pending') return;
    setFriendActionLoading(true);
    try { await updateFriendRequest(friendship.request.id, 'accepted'); }
    catch (err) { addToast((err as Error).message, 'warning'); }
    finally { setFriendActionLoading(false); }
  };

  const handleDeclineRequest = async () => {
    if (friendship.state !== 'inbound_pending') return;
    setFriendActionLoading(true);
    try { await updateFriendRequest(friendship.request.id, 'declined'); }
    catch (err) { addToast((err as Error).message, 'warning'); }
    finally { setFriendActionLoading(false); }
  };

  const handleViewFriend = (friend: TaggedMutualFriend) => {
    const friendOrigin = friend._instanceOrigin || resolveUserOrigin(friend);
    setUserOrigin(friendOrigin);
    setUser(friend);
    loadMutuals(friend.id, friend);
    setActiveTab('about');
    // Update modal data so re-opening preserves context
    useUIStore.getState().openModal('userProfile', { userId: friend.id, user: friend, origin: friendOrigin });
  };

  const handleGoToSpace = (spaceId: string) => {
    closeModal();
    navigate(`/channels/${spaceId}`);
  };


  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'about', label: 'About' },
    { key: 'friends', label: 'Mutual Friends', count: mutualFriends.length },
    { key: 'spaces', label: 'Mutual Spaces', count: mutualSpaces.length },
  ];

  // Personal tint drives panel background wash, banner glow and hairline borders.
  const accent = profileAccent;
  const tintStyle = accent
    ? ({
        '--profile-accent': accent,
        background: `linear-gradient(180deg, ${accent}1f 0%, transparent 60%)`,
        boxShadow: accent
          ? `0 0 0 1px ${accent}33, 0 24px 80px -24px ${accent}44`
          : undefined,
      } as React.CSSProperties)
    : undefined;
  const bannerGlowStyle = accent
    ? ({ boxShadow: `inset 0 -40px 60px -30px ${accent}55` } as React.CSSProperties)
    : undefined;

  const isSelfViewing = isSelfProfile;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center animate-fade-in">
      <div className="absolute inset-0 bg-black/50" onClick={closeModal} />
      <div
        ref={fx.ref}
        onMouseMove={fx.onMouseMove}
        onMouseLeave={fx.onMouseLeave}
        style={tintStyle}
        className="profile-fx fx-animatable profile-stagger relative w-full mx-4 max-h-[calc(100vh-2rem)] flex flex-col glass-modal rounded-[14px] animate-slide-up overflow-hidden md:max-w-4xl"
      >
        {/* Cursor glow layer */}
        <span className="profile-fx-glow" aria-hidden />

        {/* Banner — parallax layer + gradient overlay melting into the card */}
        <div data-stagger="1" className="h-[110px] flex-shrink-0 relative overflow-hidden">
          <div
            className="profile-fx-banner"
            style={{
              ...(bannerSrc
                ? { backgroundImage: `url(${bannerSrc})` }
                : { background: bannerFallback }),
              ...bannerGlowStyle,
            }}
          />
          <div className="profile-fx-banner-overlay" aria-hidden />
          {/* Close button */}
          <button
            onClick={closeModal}
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center transition-colors z-[3]"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
              <path d="M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z" />
            </svg>
          </button>
        </div>

        {/* Header (avatar + name) */}
        <div data-stagger="2" className="px-5 flex-shrink-0 relative">
          <div
            className="profile-presence-ring inline-block align-top -mt-[52px] mb-2 relative z-10"
            data-status={user.status ?? 'offline'}
          >
            <Avatar
              src={user.avatar}
              name={displayName}
              size={96}
              status={user.status as 'online' | 'idle' | 'dnd' | 'offline' | null}
              userId={user.homeUserId ?? user.id}
              user={user}
              ring={{ width: 3, color: 'rgba(20,20,26,0.82)' }}
              className="block"
            />
          </div>

          <div className="mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Username
                username={displayName}
                className="text-[20px] font-bold leading-tight tracking-[-0.01em]"
              />
              {user.staffRole && <StaffBadge role={user.staffRole} />}
              {user.netrexEnabled && <NetrexChip />}
            </div>
            <span className="mt-1 inline-flex items-center h-[22px] px-2 rounded-md border border-white/[0.08] bg-white/[0.04] font-mono text-[12px] tracking-[0.01em] text-txt-secondary">
              @{user.username}
            </span>
            {user.customStatus && (
              <div className="text-[13px] text-txt-secondary italic mt-1.5">
                {user.customStatus}
              </div>
            )}
            {/* Spotify vinyl — full-size showpiece in the modal header area. */}
            <SpotifyVinylBlock lookupUserId={profileUserId} isSelf={isSelfProfile} />
          </div>
        </div>

        {/* Two-column body: profile (left) + Board (right). Board collapses
            below the profile on narrow viewports. */}
        <div className="flex flex-col md:flex-row flex-1 min-h-0">
        {/* ── Left column — profile ── */}
        <div className="flex flex-col min-h-0 md:w-[55%] md:border-r md:border-white/[0.06]">
        {/* Tab bar — sliding accent indicator */}
        <div data-stagger="3" className="px-5 flex-shrink-0 border-b border-white/[0.06]">
          <div ref={tabsWrapRef} className="flex gap-1 relative">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                data-tab-key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-2 text-[13px] font-medium rounded-t-lg transition-colors relative ${
                  activeTab === tab.key
                    ? 'text-txt-primary'
                    : 'text-txt-tertiary hover:text-txt-secondary'
                }`}
              >
                {tab.label}
                {tab.count !== undefined && !loadingMutuals && (
                  <span className="ml-1 text-[11px] text-txt-tertiary tabular-nums">
                    (<CountUp value={tab.count} duration={500} />)
                  </span>
                )}
              </button>
            ))}
            <div ref={barRef} className="profile-tab-indicator" aria-hidden />
          </div>
        </div>

        {/* Tab content */}
        <div data-stagger="4" className="flex-1 overflow-y-auto scrollbar-thin p-5 min-h-[200px]">
          {activeTab === 'about' && (
            <div className="space-y-4">
              {/* Bio */}
              {user.bio && (
                <div>
                  <span className="text-[11px] uppercase tracking-wide font-semibold text-txt-tertiary">
                    About Me
                  </span>
                  <div className="text-[13px] text-txt-secondary mt-1 whitespace-pre-wrap break-words leading-relaxed [&_strong]:font-semibold [&_strong]:text-txt-primary [&_em]:italic [&_a]:text-accent-primary [&_a]:underline">
                    <ReactMarkdown
                      allowedElements={['p', 'strong', 'em', 'a', 'br']}
                      unwrapDisallowed
                      components={{
                        a: ({ href, children }) => (
                          <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
                        ),
                      }}
                    >
                      {user.bio}
                    </ReactMarkdown>
                  </div>
                </div>
              )}

              {/* Member Since */}
              <div>
                <span className="text-[11px] uppercase tracking-wide font-semibold text-txt-tertiary">
                  Member Since
                </span>
                <div className="text-[13px] text-txt-secondary mt-1">
                  {new Date(user.createdAt).toLocaleDateString(undefined, {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </div>
              </div>

            </div>
          )}

          {activeTab === 'friends' && (
            <div>
              {loadingMutuals ? (
                <div className="flex items-center justify-center py-8">
                  <svg className="animate-spin w-5 h-5 text-txt-tertiary" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              ) : mutualFriends.length === 0 ? (
                <div className="text-center py-8 text-txt-tertiary text-[13px]">
                  No mutual friends
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {mutualFriends.map((friend) => {
                    const fname = friend.displayName ?? parseFederatedUsername(friend.username).baseName;
                    return (
                      <button
                        key={friend.id}
                        onClick={() => handleViewFriend(friend)}
                        className="flex items-center gap-2.5 p-2.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.04] transition-colors text-left"
                      >
                        <Avatar
                          src={friend.avatar}
                          name={fname}
                          size={40}
                          status={friend.status as 'online' | 'idle' | 'dnd' | 'offline' | null}
                          userId={friend.homeUserId ?? friend.id}
                          avatarColor={friend.avatarColor}
                        />
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-txt-primary truncate">
                            {fname}
                          </div>
                          <div className="text-[11px] text-txt-tertiary capitalize">
                            {friend.status}
                          </div>
                          {friend._instanceOrigin && (
                            <div className="flex items-center gap-1 text-[10px] text-txt-tertiary/70 truncate">
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                              </svg>
                              <span className="truncate">{(() => { try { return new URL(friend._instanceOrigin).host; } catch { return '?'; } })()}</span>
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'spaces' && (
            <div>
              {loadingMutuals ? (
                <div className="flex items-center justify-center py-8">
                  <svg className="animate-spin w-5 h-5 text-txt-tertiary" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              ) : mutualSpaces.length === 0 ? (
                <div className="text-center py-8 text-txt-tertiary text-[13px]">
                  No mutual spaces
                </div>
              ) : (
                <div className="space-y-1">
                  {mutualSpaces.map((space) => {
                    const spaceApi = getApiForOrigin(space._instanceOrigin);
                    return (
                    <button
                      key={`${space.id}:${space._instanceOrigin}`}
                      onClick={() => handleGoToSpace(space.id)}
                      className="flex items-center gap-3 w-full p-2.5 rounded-lg hover:bg-white/[0.06] transition-colors text-left"
                    >
                      <div className="relative shrink-0">
                        {space.icon ? (
                          <img
                            src={space.icon.startsWith('http') ? space.icon : spaceApi.uploads.url(space.icon)}
                            alt={space.name}
                            className="w-8 h-8 rounded-lg object-cover"
                          />
                        ) : (
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-[13px] font-semibold text-white"
                            style={{ background: getSpaceGradient(space.id, space.name, space.avatarColor).gradient }}
                          >
                            {space.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        {space._instanceOrigin && (
                          <div className="absolute -bottom-0.5 -right-0.5 w-[14px] h-[14px] rounded-full bg-[#1a1a23] flex items-center justify-center">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-txt-tertiary/80">
                              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex flex-col">
                        <span className="text-[13px] font-medium text-txt-primary truncate">
                          {space.name}
                        </span>
                        {space._instanceOrigin && (
                          <span className="text-[10px] text-txt-tertiary/70 truncate flex items-center gap-1">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
                              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                            </svg>
                            {(() => { try { return new URL(space._instanceOrigin).host; } catch { return '?'; } })()}
                          </span>
                        )}
                      </div>
                    </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        {/* /left column tab content */}

        {/* Action buttons — luminous hover */}
        <div data-stagger="5" className="flex-shrink-0 px-5 py-3 border-t border-white/[0.06] flex gap-2">
          <button
            onClick={handleSendMessage}
            className="flex-1 py-2 rounded-lg text-[13px] font-medium text-white bg-accent-primary hover:bg-accent-primary/85 dm-icon-btn transition-colors"
          >
            Send Message
          </button>

          {friendship.state === 'none' && (
            <button onClick={handleAddFriend} disabled={friendActionLoading}
              className="flex-1 py-2 rounded-lg text-[13px] font-medium text-txt-primary border border-white/[0.08] bg-white/[0.06] hover:bg-white/[0.10] transition-colors disabled:opacity-50">
              {friendActionLoading ? '...' : 'Add Friend'}
            </button>
          )}

          {friendship.state === 'outbound_pending' && (
            <button onClick={handleCancelRequest} disabled={friendActionLoading}
              className="flex-1 py-2 rounded-lg text-[13px] font-medium text-amber-400 border border-amber-400/30 hover:bg-amber-400/10 transition-colors disabled:opacity-50">
              {friendActionLoading ? '...' : 'Cancel Request'}
            </button>
          )}

          {friendship.state === 'inbound_pending' && (
            <>
              <button onClick={handleAcceptRequest} disabled={friendActionLoading}
                className="flex-1 py-2 rounded-lg text-[13px] font-medium text-white bg-accent-primary hover:bg-accent-primary/80 transition-colors disabled:opacity-50">
                {friendActionLoading ? '...' : 'Accept'}
              </button>
              <button onClick={handleDeclineRequest} disabled={friendActionLoading}
                className="py-2 px-3 rounded-lg text-[13px] font-medium text-txt-tertiary border border-white/[0.06] hover:bg-white/[0.06] transition-colors disabled:opacity-50">
                {friendActionLoading ? '...' : 'Ignore'}
              </button>
            </>
          )}

          {friendship.state === 'friends' && (
            <button onClick={handleRemoveFriend} disabled={friendActionLoading}
              className="flex-1 py-2 rounded-lg text-[13px] font-medium text-txt-danger border border-txt-danger/30 hover:bg-txt-danger/10 transition-colors disabled:opacity-50">
              {friendActionLoading ? '...' : 'Remove Friend'}
            </button>
          )}
        </div>
        {/* /action buttons */}
        </div>
        {/* /left column */}

        {/* ── Right column — the Board (own scroll; collapses below on mobile) ── */}
        <div
          data-stagger="6"
          className="flex flex-col min-h-0 md:w-[45%] border-t md:border-t-0 md:border-l border-white/[0.06] max-h-[50vh] md:max-h-none"
        >
          <div className="flex items-center justify-between px-4 py-2.5 flex-shrink-0 border-b border-white/[0.06]">
            <span className="text-[11px] uppercase tracking-wide font-semibold text-txt-tertiary">
              {boardTabLabel}
            </span>
            {isSelfViewing && (
              <div className="flex items-center gap-2">
                {/* Personal profile tint — color picker + soft-dark preset */}
                <label
                  className="flex items-center gap-1.5 cursor-pointer"
                  title="Profile color"
                >
                  <input
                    type="color"
                    value={accent ?? '#7c6cff'}
                    // Drag: local state only — zero network, instant preview via
                    // the existing --profile-accent CSS var.
                    onChange={(e) => setProfileAccent(e.target.value)}
                    // Commit: exactly one PUT on release (deduped with blur by
                    // savedAccentRef inside handleProfileAccentChange).
                    onPointerUp={(e) => void handleProfileAccentChange((e.target as HTMLInputElement).value)}
                    onBlur={(e) => void handleProfileAccentChange(e.target.value)}
                    className="w-5 h-5 rounded cursor-pointer bg-transparent border border-white/[0.15] p-0.5"
                    aria-label="Profile color"
                  />
                  <span className="text-[11px] text-txt-tertiary hidden sm:inline">Color</span>
                </label>
                <button
                  onClick={() => void handleProfileAccentChange('#2a2438')}
                  className="w-5 h-5 rounded border border-white/[0.15] bg-gradient-to-b from-[#3a3352] to-[#1c1828]"
                  title="Soft dark"
                  aria-label="Soft dark preset"
                />
                {accent && (
                  <button
                    onClick={() => void handleProfileAccentChange(null)}
                    className="text-[11px] text-txt-tertiary hover:text-txt-secondary"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0">
            <ProfileBoardTab
              user={user}
              origin={userOrigin}
              onBoardSaved={(widgets) => {
                setUser((prev) => (prev ? { ...prev, profileBoard: widgets } : prev));
              }}
            />
          </div>
        </div>
        {/* /right column */}
        </div>
        {/* /two-column body */}
      </div>

    </div>
  );
}

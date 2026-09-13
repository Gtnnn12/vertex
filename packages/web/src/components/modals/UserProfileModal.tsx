import React, { useEffect, useState, useCallback, useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import type { User } from '@backspace/shared';
import { Avatar } from '../ui/Avatar';
import { Username } from '../ui/Username';
import { CustomStatusBubble } from '../ui/CustomStatusBubble';
import { useProfileCardFX } from '../ui/useProfileCardFX';
import { CountUp } from '../../utils/CountUp';
import { useUIStore } from '../../stores/uiStore';
import { useSpaceStore, getApiForOrigin, resolveUserOrigin } from '../../stores/spaceStore';
import { api } from '../../api/client';
import { useSocialStore, type TaggedFriend, type TaggedFriendRequest } from '../../stores/socialStore';
import { getFriendshipStatus, type FriendshipStatus } from '../../utils/friendship';
import { SpotifyVinylBlock } from '../spotify/SpotifyVinylBlock';
import { mapServerErrorToMessage } from '../../utils/friendErrors';
import { useAuthStore } from '../../stores/authStore';
import { getAvatarGradient, getSpaceGradient, adjustColor, mutedGradient } from '../../utils/gradients';
import { parseFederatedUsername, isSelf } from '../../utils/identity';
import { loadFederatedMutuals, type TaggedMutualFriend, type MutualSpace } from '../../utils/mutuals';
import { StaffBadge, NetrexChip } from '../ui/StaffBadge';
import { ProfileBoardTab } from '../profile/board/ProfileBoardTab';
import { useLanguage } from '../../contexts/LanguageContext';
import { profileTint } from '../../utils/profileTint';

type Tab = 'board' | 'friends' | 'spaces';

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
  const [activeTab, setActiveTab] = useState<Tab>('board');
  // Lifted editor state: the "+ Añadir widget" button lives in the board
  // header (row 2), the editor lives in ProfileBoardTab.
  const [mutualFriends, setMutualFriends] = useState<TaggedMutualFriend[]>([]);
  const [mutualSpaces, setMutualSpaces] = useState<MutualSpace[]>([]);
  const [loadingMutuals, setLoadingMutuals] = useState(false);
  const [friendActionLoading, setFriendActionLoading] = useState(false);
  const [profileAccent, setProfileAccent] = useState<string | null>(null);
  const [boardEditing, setBoardEditing] = useState(false);
  // In-flight drag color for the direct-DOM preview: while dragging,
  // --profile-accent is written straight to the modal container — no React
  // state, no re-render — and committed to state only on save.
  const dragAccentRef = useRef<string | null>(null);

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
      setActiveTab('board');
      const origin = passedOrigin || (passedUser ? resolveUserOrigin(passedUser) : '');
      setUserOrigin(origin);
      // Use the passed user directly (avoids 404 for federated users on local API)
      if (passedUser) {
        setUser(passedUser);
        setProfileAccent(passedUser.profileAccent ?? null);
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

  // Persist the personal profile tint (self profile only). Called ONLY from
  // the explicit “Guardar personalización” button — never from picker drag
  // events. Optimistic: apply locally first, roll back on failure with a
  // toast. Hook MUST run unconditionally — calling this after the early
  // return below changed the hook count between renders and crashed React.
  const handleProfileAccentChange = useCallback(async (hex: string | null) => {
    const prev = profileAccent;
    setProfileAccent(hex);
    // Keep the direct-DOM preview var in sync (drag writes it without a
    // re-render; this covers save / preset / clear paths). 'transparent'
    // keeps the color-mix consumers neutral when the tint is cleared.
    fx.ref.current?.style.setProperty('--profile-accent', hex || 'transparent');
    dragAccentRef.current = null;
    try {
      await api.users.update({ profileAccent: hex ?? '' });
      addToast('Personalización guardada', 'success');
      // Persistence: patch EVERY cache the modal / popout can re-read from.
      // On reopen with a passedUser snapshot the modal never re-fetches, so
      // each store must carry the new accent (same pattern as the board's
      // onBoardSaved optimistic update).
      setUser((prev) => (prev ? { ...prev, profileAccent: hex } : prev));
      const selfUser = useAuthStore.getState().user;
      if (user && selfUser && (user.id === selfUser.id || (user.homeUserId && user.homeUserId === (selfUser.homeUserId ?? selfUser.id)))) {
        useAuthStore.getState().setUser({ ...selfUser, profileAccent: hex });
      }
      if (user) {
        useSpaceStore.getState().upsertUserView({ ...user, profileAccent: hex }, userOrigin);
      }
    } catch (err) {
      setProfileAccent(prev);
      fx.ref.current?.style.setProperty('--profile-accent', prev || 'transparent');
      addToast((err as Error).message || 'Could not save profile color', 'warning');
    }
  }, [profileAccent, addToast, fx.ref, user, userOrigin]);

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
    setActiveTab('board');
    // Update modal data so re-opening preserves context
    useUIStore.getState().openModal('userProfile', { userId: friend.id, user: friend, origin: friendOrigin });
  };

  const handleGoToSpace = (spaceId: string) => {
    closeModal();
    navigate(`/channels/${spaceId}`);
  };


  const tabs: { key: Tab; label: string; count?: number; disabled?: boolean }[] = [
    { key: 'board', label: boardTabLabel },
    { key: 'friends', label: t('board_tab_mutual_friends'), count: mutualFriends.length },
    { key: 'spaces', label: t('board_tab_mutual_spaces'), count: mutualSpaces.length },
  ];

  // Personal tint drives panel background wash, banner glow and hairline borders.
  const accent = profileAccent;
  // Shared tint util — the ONE source for every profile surface. 'full'
  // intensity fills the whole big modal (top glow from the banner + bottom
  // fade, behind both columns). Drag writes the same var directly to the
  // DOM for the live preview.
  const tint = profileTint(accent, 'full');

  const isSelfViewing = isSelfProfile;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center animate-fade-in">
      <div className="absolute inset-0 bg-black/50" onClick={closeModal} />
      <div
        ref={fx.ref}
        onMouseMove={fx.onMouseMove}
        onMouseLeave={fx.onMouseLeave}
        style={{ ...(tint.style ?? {}), clipPath: 'inset(0 round 14px)' }}
        className={`profile-fx fx-animatable profile-stagger ${tint.className} relative w-full mx-4 max-h-[calc(100vh-2rem)] flex flex-col glass-modal rounded-[14px] animate-slide-up overflow-hidden md:max-w-4xl`}
      >
        {/* Cursor glow layer */}
        <span className="profile-fx-glow" aria-hidden />

        {/* Two-column body (Discord layout): LEFT ~35% = compact profile column
            (own banner + avatar + identity, like Discord's member card).
            RIGHT ~65% = the Board with its own header tabs. The banner does NOT
            span both columns. Mobile: profile first, board below. */}
        <div className="flex flex-col md:flex-row flex-1 min-h-0">
        {/* ── LEFT column — compact profile ── */}
        <div className="flex flex-col min-h-0 md:w-[45%] border-t md:border-t-0 md:border-r border-white/[0.06] max-h-[50vh] md:max-h-none min-w-0 md:min-w-[320px]">
          {/* Banner + avatar — ONE relative container, Discord-exact:
              banner 140px cover rounded-top; avatar ABSOLUTE bottom -36px
              left 16px (half out of the banner), no negative margins. */}
          <div data-stagger="1" className="px-4 pt-4 flex-shrink-0">
          <div className="relative">
            <div className="relative h-[140px] md:rounded-t-[13px] rounded-t-xl overflow-hidden">
              <div
                className="profile-fx-banner"
                style={{
                  ...(bannerSrc
                    ? { backgroundImage: `url(${bannerSrc})` }
                    : { background: bannerFallback }),
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
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
            <div className="absolute -bottom-9 left-4 z-20">
              <div>
                <Avatar
                  src={user.avatar}
                  name={displayName}
                  size={88}
                  status={user.status as 'online' | 'idle' | 'dnd' | 'offline' | null}
                  userId={user.homeUserId ?? user.id}
                  user={user}
                  ring={{ width: 6, color: 'rgb(26 22 32 / 0.92)' }}
                  className="block"
                />
              </div>
            </div>
          </div>
          </div>

          {/* Identity — LEFT-aligned again (like the reference); pt-14 (56px)
              reserves room for the avatar half hanging under the banner. */}
          <div data-stagger="2" className="px-5 pt-14 pb-4 flex-1 overflow-y-auto scrollbar-thin min-h-0">
            <div className="pb-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Username
                  username={displayName}
                  className="text-[19px] font-bold leading-tight tracking-[-0.01em]"
                />
                {user.staffRole && <StaffBadge role={user.staffRole} />}
                {user.netrexEnabled && <NetrexChip />}
              </div>
              <div className="mt-4">
                <span className="inline-flex items-center h-[20px] px-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] font-mono text-[11px] tracking-[0.01em] text-txt-secondary">
                  @{user.username}
                </span>
              </div>
              <CustomStatusBubble status={user.customStatus} />
              {user.bio && user.bio.trim() ? (
                <p className="mt-4 text-[12.5px] leading-relaxed text-txt-secondary whitespace-pre-wrap break-words line-clamp-3">
                  {user.bio.replace(/[*_~`#>\[\]]/g, '').trim().slice(0, 160)}
                </p>
              ) : null}

              <div className="mt-4 text-[12px] text-txt-secondary">
                <span className="block text-[10.5px] uppercase tracking-wide font-semibold text-txt-tertiary mb-0.5">
                  {t('profile_member_since')}
                </span>
                {new Date(user.createdAt).toLocaleDateString(undefined, {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>
            </div>
          </div>

          {/* Actions — pinned to the column bottom */}
          <div data-stagger="3" className="flex-shrink-0 px-5 pb-4">
            <div className="flex gap-2">
              {friendship.state === 'none' && (
                <button onClick={handleAddFriend} disabled={friendActionLoading}
                  className="flex-1 py-2 rounded-lg text-[12.5px] font-medium text-txt-primary border border-white/[0.08] bg-white/[0.06] hover:bg-white/[0.10] transition-colors disabled:opacity-50">
                  {friendActionLoading ? '...' : t('profile_action_add_friend')}
                </button>
              )}
              {friendship.state === 'outbound_pending' && (
                <button onClick={handleCancelRequest} disabled={friendActionLoading}
                  className="flex-1 py-2 rounded-lg text-[12.5px] font-medium text-amber-400 border border-amber-400/30 hover:bg-amber-400/10 transition-colors disabled:opacity-50">
                  {friendActionLoading ? '...' : t('profile_action_cancel_request')}
                </button>
              )}
              {friendship.state === 'inbound_pending' && (
                <>
                  <button onClick={handleAcceptRequest} disabled={friendActionLoading}
                    className="flex-1 py-2 rounded-lg text-[12.5px] font-medium text-white bg-accent-primary hover:bg-accent-primary/80 transition-colors disabled:opacity-50">
                    {friendActionLoading ? '...' : t('profile_action_accept')}
                  </button>
                  <button onClick={handleDeclineRequest} disabled={friendActionLoading}
                    className="py-2 px-3 rounded-lg text-[12.5px] font-medium text-txt-tertiary border border-white/[0.06] hover:bg-white/[0.06] transition-colors disabled:opacity-50">
                    {friendActionLoading ? '...' : t('profile_action_ignore')}
                  </button>
                </>
              )}
              {friendship.state === 'friends' && (
                <button onClick={handleRemoveFriend} disabled={friendActionLoading}
                  className="flex-1 py-2 rounded-lg text-[12.5px] font-medium text-txt-danger border border-txt-danger/30 hover:bg-txt-danger/10 transition-colors disabled:opacity-50">
                  {friendActionLoading ? '...' : t('profile_action_remove_friend')}
                </button>
              )}
              {friendship.state !== 'self' && (
                <button
                  onClick={handleSendMessage}
                  className="py-2 px-3 rounded-lg text-[12.5px] font-medium text-white bg-accent-primary hover:bg-accent-primary/85 dm-icon-btn transition-colors"
                >
                  {t('profile_action_message')}
                </button>
              )}
            </div>
          </div>
        </div>
        {/* /left column — compact profile */}

        {/* ── RIGHT column — the Board (wide) ── */}
        <div data-stagger="4" className="flex flex-col min-h-0 md:w-[55%] min-w-0">
          {/* Board header — DECOUPLED rows: row 1 = the tabs on their own
              line; row 2 = "Tus widgets" + add + tint controls. */}
          <div className="px-4 py-2.5 flex-shrink-0 border-b border-white/[0.06]">
            <div ref={tabsWrapRef} className="flex gap-1 relative min-w-0 overflow-x-auto scrollbar-none">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  data-tab-key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-1.5 text-[13px] rounded-md transition-colors ${
                    activeTab === tab.key
                      ? 'font-semibold text-txt-primary bg-white/[0.06]'
                      : 'font-medium text-txt-tertiary hover:text-txt-secondary'
                  }`}
                >
                  {tab.label}
                  {tab.count !== undefined && !loadingMutuals && (
                    <span className="ml-1 text-[11px] text-txt-tertiary tabular-nums">
                      ({tab.count})
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {activeTab === 'board' ? (
            <>
            {/* Row 2: widgets label + add button + tint picker/save — ONE row */}
            <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-1 flex-shrink-0">
              <span className="text-[11px] uppercase tracking-wide font-semibold text-txt-tertiary whitespace-nowrap">
                {t('board_your_widgets')}
              </span>
              <div className="flex items-center gap-2 flex-shrink-0">
                {isSelfViewing && (
                  <button
                    onClick={() => setBoardEditing(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-accent-primary px-3 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-accent-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    {t('board_add_widget')}
                  </button>
                )}
                {isSelfViewing && (
                  <label
                    className="flex items-center gap-1.5 cursor-pointer"
                    title="Profile color"
                  >
                    <input
                      type="color"
                      value={accent ?? '#7c6cff'}
                      // Live preview ONLY via direct CSS-var write — zero network
                      // and zero re-render while dragging. The explicit save
                      // button commits the value.
                      onChange={(e) => {
                        dragAccentRef.current = e.target.value;
                        fx.ref.current?.style.setProperty('--profile-accent', e.target.value);
                      }}
                      className="w-5 h-5 rounded cursor-pointer bg-transparent border border-white/[0.15] p-0.5"
                      aria-label="Profile color"
                    />
                    <span className="text-[11px] text-txt-tertiary hidden sm:inline">Color</span>
                  </label>
                )}
                {/* Explicit save — the ONLY path that hits the network. Passes
                    the in-flight drag color when present (drag does not touch
                    React state), falling back to the saved state value. */}
                {isSelfViewing && (
                  <button
                    onClick={() => void handleProfileAccentChange(dragAccentRef.current ?? accent)}
                    className="rounded-lg bg-accent-primary px-3 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-accent-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                    title="Guardar personalización"
                  >
                    Guardar personalización
                  </button>
                )}
                {isSelfViewing && (
                  <button
                    onClick={() => void handleProfileAccentChange('#2a2438')}
                    className="w-5 h-5 rounded border border-white/[0.15] bg-gradient-to-b from-[#3a3352] to-[#1c1828]"
                    title="Soft dark"
                    aria-label="Soft dark preset"
                  />
                )}
                {isSelfViewing && accent && (
                  <button
                    onClick={() => void handleProfileAccentChange(null)}
                    className="text-[11px] text-txt-tertiary hover:text-txt-secondary"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0 px-4 pb-4">
              <ProfileBoardTab
                user={user}
                origin={userOrigin}
                externalEditing={boardEditing}
                onExternalEditingChange={setBoardEditing}
                onBoardSaved={(widgets) => {
                  setUser((prev) => (prev ? { ...prev, profileBoard: widgets } : prev));
                }}
              />
            </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0 p-4">
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
                            </div>
                            <span className="text-[13px] font-medium text-txt-primary truncate">
                              {space.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        {/* /right column — the Board */}
        </div>
        {/* /two-column body */}
      </div>

    </div>
  );
}

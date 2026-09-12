import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from '@backspace/shared';
import { ProfileIdentityCard } from './ProfileIdentityCard';
import { useSpaceStore, getApiForOrigin, resolveUserOrigin } from '../../stores/spaceStore';
import { api } from '../../api/client';
import { useUIStore } from '../../stores/uiStore';
import { parseFederatedUsername } from '../../utils/identity';
import { useCanonicalUserView } from '../../utils/userViewLookup';
import { loadFederatedMutuals } from '../../utils/mutuals';
import { StaffBadge, NetrexChip } from './StaffBadge';
import { SpotifyVinylBlock } from '../spotify/SpotifyVinylBlock';
import { computeFloatingPosition, type AnchorRect, type Placement } from '../../hooks/useFloatingPosition';
import { useLanguage } from '../../contexts/LanguageContext';

/** Gap between the card and the element it was opened from. */
const ANCHOR_OFFSET = 8;

interface UserProfilePopoutProps {
  user: User;
  onClose: () => void;
  /** Rect of the element the card was opened from. */
  anchor: AnchorRect;
  placement?: Placement;
}

export function UserProfilePopout({ user: propUser, onClose, anchor, placement = 'right' }: UserProfilePopoutProps) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const addDmChannel = useSpaceStore((s) => s.addDmChannel);
  const openModal = useUIStore((s) => s.openModal);
  // Resolve to the best-known view of this user from the userViews cache.
  // The prop frequently arrives as a federated stub (when the carrying DM
  // came from a sibling instance that won the populateFromReady dedup race);
  // routing through the cache surfaces the home view when one is loaded.
  // Identity fields (id, homeUserId, homeInstance) are preserved across
  // canonicalization, so write-payload code paths below remain correct.
  const user = useCanonicalUserView(propUser);
  const { baseName, domain } = parseFederatedUsername(user.username);
  const displayName = user.displayName ?? baseName;

  const origin = resolveUserOrigin(user);
  const userApi = getApiForOrigin(origin);

  const [mutualCounts, setMutualCounts] = useState<{ friends: number; spaces: number } | null>(null);

  // “Listening now” — one shared block for every profile surface, with the
  // exact lookup the activity panel uses (same store, same key).
  const spotifyLookupId = user.homeUserId ?? user.id;

  useEffect(() => {
    loadFederatedMutuals(user.id, user.homeUserId)
      .then((data) => setMutualCounts({ friends: data.mutualFriends.length, spaces: data.mutualSpaces.length }))
      .catch(() => {});
  }, [user.id, user.homeUserId]);

  // Placed off the card's *measured* size rather than a guessed height: the card
  // grows with the bio, the custom status and the mutuals row, so any constant
  // here would cut tall cards off at the bottom of the viewport.
  const cardRef = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const place = () => {
      const { width, height } = card.getBoundingClientRect();
      // 'start': the card's top edge lines up with the row it came from, the
      // way it always has — centring a tall card on a 32px avatar would drag it
      // up over unrelated content.
      const next = computeFloatingPosition(anchor, width, height, placement, ANCHOR_OFFSET, 'start');
      setPlaced((prev) =>
        prev && prev.top === next.top && prev.left === next.left
          ? prev
          : { top: next.top, left: next.left },
      );
    };

    place();
    const observer = new ResizeObserver(place);
    observer.observe(card);
    window.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [anchor, placement]);

  const handleSendMessage = async () => {
    try {
      const existing = useSpaceStore.getState().findExistingDmForUser(user);
      if (existing) {
        useUIStore.getState().setShowDms(true);
        onClose();
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
      onClose();
      navigate(`/channels/@me/${channel.id}`);
    } catch (err) {
      console.error('Failed to create DM channel:', err);
    }
  };

  const handleViewFullProfile = () => {
    onClose();
    openModal('userProfile', { userId: user.id, user, origin });
  };

  const handleAvatarClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    handleViewFullProfile();
  };

  // Banner source
  const bannerSrc = user.banner
    ? (user.banner.startsWith('http') || user.banner.startsWith('/') ? user.banner : userApi.uploads.url(user.banner))
    : null;
  const avatarSrc = user.avatar
    ? (user.avatar.startsWith('http') || user.avatar.startsWith('/') ? user.avatar : userApi.uploads.url(user.avatar))
    : null;

  // Parked off-screen for the one layout pass before the card knows how tall it
  // is; `useLayoutEffect` places it before the browser paints, so it never
  // renders visibly in the wrong spot.
  const cardStyle = placed ?? { top: -9999, left: -9999 };

  return (
    <div
      ref={cardRef}
      data-user-profile-popout
      className="fixed z-[200] w-[340px] animate-fade-in"
      style={cardStyle}
    >
      <ProfileIdentityCard
        displayName={displayName}
        username={baseName}
        avatarSrc={avatarSrc}
        bannerSrc={bannerSrc}
        avatarColor={user.avatarColor}
        accentColor={user.accentColor}
        profileAccent={user.profileAccent}
        userId={user.homeUserId ?? user.id}
        status={user.status as 'online' | 'idle' | 'dnd' | 'offline' | null}
        customStatus={user.customStatus}
        bio={user.bio}
        nameSuffix={
          <>
            {user.staffRole && <StaffBadge role={user.staffRole} />}
            {user.netrexEnabled && <NetrexChip />}
          </>
        }
        onAvatarClick={handleAvatarClick}
        footer={
          <>
            {/* Spotify vinyl — only when the user is actually listening. */}
            <SpotifyVinylBlock lookupUserId={spotifyLookupId} isSelf />


            {/* Member since + Mutuals — hairline stat pills row */}
            <div data-stagger="4" className="space-y-1.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="inline-flex items-center h-[22px] px-2 rounded-md bg-white/[0.04] border border-white/[0.06] text-[11px] font-medium text-txt-secondary">
                  <span className="uppercase tracking-[0.1em] text-[10px] text-txt-tertiary mr-1.5">{t('member_since')}</span>
                  {new Date(user.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                {mutualCounts && mutualCounts.friends > 0 && (
                  <span className="inline-flex items-center h-[22px] px-2 rounded-md bg-white/[0.04] border border-white/[0.06] text-[11px] font-medium text-txt-secondary">
                    {mutualCounts.friends === 1 ? t('mutual_friend') : t('mutual_friends').replace('{count}', String(mutualCounts.friends))}
                  </span>
                )}
                {mutualCounts && mutualCounts.spaces > 0 && (
                  <span className="inline-flex items-center h-[22px] px-2 rounded-md bg-white/[0.04] border border-white/[0.06] text-[11px] font-medium text-txt-secondary">
                    {mutualCounts.spaces === 1 ? t('mutual_space') : t('mutual_spaces').replace('{count}', String(mutualCounts.spaces))}
                  </span>
                )}
              </div>
            </div>

            {/* Actions — luminous hover buttons */}
            <div data-stagger="5">
              <button
                onClick={handleSendMessage}
                className="w-full mt-3 py-2 rounded-lg text-[13px] font-medium text-txt-primary bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.08] dm-icon-btn transition-colors"
              >
                {t('send_message')}
              </button>
              <button
                onClick={handleViewFullProfile}
                className="w-full mt-1.5 py-2 rounded-lg text-[13px] font-medium text-txt-tertiary hover:text-txt-secondary bg-transparent hover:bg-white/[0.04] transition-colors"
              >
                {t('view_full_profile')}
              </button>
            </div>
          </>
        }
      />
    </div>
  );
}

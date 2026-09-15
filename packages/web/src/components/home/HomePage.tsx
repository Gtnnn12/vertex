import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CountUp } from '../../utils/CountUp';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useSocialStore } from '../../stores/socialStore';
import { useSpaceStore } from '../../stores/spaceStore';
import { useChatStore } from '../../stores/chatStore';
import { useActivityStore } from '../../stores/activityStore';
import { useSpotifyStore } from '../../stores/spotifyStore';
import { SpotifyVinyl, SpotifyGlyph } from '../spotify/SpotifyVinyl';

/** Authorize navigation URL with the session JWT as ?token= (BUG 1 fix). */
function authorizeUrl(): string {
  const token = useAuthStore.getState().token;
  return `/api/spotify/authorize${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}
import { useUIStore } from '../../stores/uiStore';
import { useLanguage } from '../../contexts/LanguageContext';
import { useCanonicalUserView } from '../../utils/userViewLookup';
import { parseFederatedUsername, isSelf } from '../../utils/identity';
import { formatDmHeaderName, formatDmSidebarPreview, formatDmTimestamp } from '../../utils/dmFormatters';
import { Avatar } from '../ui/Avatar';
import { AvatarStack } from '../ui/AvatarStack';
import { Username } from '../ui/Username';
import { ActivityCard, getActivityAccentClass } from '../ui/ActivityCard';
import { getPrimaryActivity } from '@vertex/shared/src/activities.js';
import type { Activity, DmChannel, Friend, FriendRequest, User } from '@vertex/shared';

type QuickKind = 'friends' | 'messages' | 'activity' | 'explore';

/**
 * Presentation-only: true once the element scrolls into view (fires once).
 * Falls back to true when IntersectionObserver is unavailable.
 */
function useInView(ref: React.RefObject<HTMLElement | null>): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return inView;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function QuickIcon({ kind }: { kind: QuickKind }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-shrink-0"
    >
      {kind === 'friends' && (
        <>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </>
      )}
      {kind === 'messages' && <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />}
      {kind === 'activity' && <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />}
      {kind === 'explore' && (
        <>
          <circle cx="12" cy="12" r="10" />
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
        </>
      )}
    </svg>
  );
}

function SectionEyebrow({ label, desc }: { label: string; desc?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-txt-tertiary">
          {label}
        </span>
        <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-white/[0.09] to-transparent" />
      </div>
      {desc && <p className="text-[12px] leading-[1.45] text-txt-tertiary/85">{desc}</p>}
    </div>
  );
}

function QuickModule({
  kind,
  label,
  count,
  desc,
  onClick,
}: {
  kind: QuickKind;
  label: string;
  count: number | null;
  desc: string;
  onClick: () => void;
}) {
  // Cursor-follow glow: the radial layer is anchored at --mx/--my, updated
  // on mousemove. Pure presentation — click/navigation flow is untouched.
  const glowRef = useRef<HTMLSpanElement>(null);
  const handleGlowMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const layer = glowRef.current;
    if (!layer) return;
    if (prefersReducedMotion()) return;
    const rect = e.currentTarget.getBoundingClientRect();
    layer.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    layer.style.setProperty('--my', `${e.clientY - rect.top}px`);
  };

  return (
    <button
      onClick={onClick}
      onMouseMove={handleGlowMove}
      className={[
        'group relative flex h-full w-full min-h-[150px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/[0.06]',
        'bg-surface-base/45 px-5 py-6 text-center home-card-lift',
        'hover:border-[rgb(var(--accent-primary)/0.32)] hover:bg-surface-base/70',
        'hover:shadow-[0_8px_24px_-12px_rgb(var(--accent-primary-glow)/0.4)]',
        'hover:-translate-y-0.5',
        'active:scale-[0.98] active:translate-y-0',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
      ].join(' ')}
    >
      <span
        ref={glowRef}
        aria-hidden
        className="home-card-glow-layer"
      />

      <span className="home-card-lift-inner relative flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.025] text-txt-tertiary transition-all duration-200 group-hover:border-accent-primary/30 group-hover:text-accent-primary group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100">
        <QuickIcon kind={kind} />
      </span>

      <span className="relative mt-4 flex flex-col items-center gap-1">
        <span className="flex items-center gap-1.5">
          <span className="text-[13.5px] font-semibold tracking-[-0.005em] text-txt-primary text-center">
            {label}
          </span>
          {count !== null && count > 0 && (
            <span className="rounded-full bg-accent-primary/15 px-1.5 py-[1px] text-[10px] font-semibold text-txt-secondary tabular-nums">
              {count}
            </span>
          )}
        </span>
        <span className="text-[11.5px] leading-[1.4] text-txt-tertiary/85 text-center">{desc}</span>
      </span>
    </button>
  );
}

function FriendAvatar({ user, size }: { user: Friend; size: number }) {
  const canonical = useCanonicalUserView(user as unknown as User);
  const { baseName } = parseFederatedUsername(canonical.username);
  const displayName = canonical.displayName ?? baseName;
  return (
    <Avatar
      src={canonical.avatar}
      name={displayName}
      size={size}
      status={canonical.status}
      userId={canonical.homeUserId ?? canonical.id}
      avatarColor={canonical.avatarColor}
    />
  );
}

function RequestRow({
  request,
  onAccept,
  onDecline,
}: {
  request: FriendRequest;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const other = request.user;
  if (!other) return null;
  const canonical = useCanonicalUserView(other);
  const { baseName } = parseFederatedUsername(canonical.username);
  const displayName = canonical.displayName ?? baseName;

  return (
    <div className="group flex items-center gap-3 rounded-[10px] px-2 py-2 transition-colors hover:bg-white/[0.03] motion-reduce:transition-none">
      <Avatar
        src={canonical.avatar}
        name={displayName}
        size={30}
        status={canonical.status}
        userId={canonical.homeUserId ?? canonical.id}
        avatarColor={canonical.avatarColor}
        className="flex-shrink-0"
      />
      <Username
        username={displayName}
        className="flex-1 min-w-0 truncate text-[13px] font-medium text-txt-primary"
      />
      <div className="flex flex-shrink-0 items-center gap-1.5">
        <button
          onClick={onAccept}
          className="rounded-[8px] bg-accent-primary/15 px-2.5 py-1 text-[11px] font-medium text-txt-primary transition-colors hover:bg-accent-primary/25 motion-reduce:transition-none"
        >
          Accept
        </button>
        <button
          onClick={onDecline}
          className="rounded-[8px] px-2.5 py-1 text-[11px] font-medium text-txt-tertiary transition-colors hover:bg-white/[0.06] hover:text-txt-primary motion-reduce:transition-none"
        >
          Decline
        </button>
      </div>
    </div>
  );
}

function RecentRow({
  dm,
  currentUser,
  isFirst,
}: {
  dm: DmChannel;
  currentUser: User;
  isFirst: boolean;
}) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const isGroup = !!dm.ownerId;
  const otherMembers = dm.members.filter((m) => !isSelf(m, currentUser));
  const firstOther = otherMembers[0] ?? null;
  const headerName = formatDmHeaderName(dm, currentUser);
  const preview = formatDmSidebarPreview(dm, { id: currentUser.id, username: currentUser.username });
  const previewText = preview ?? (isGroup ? `${dm.members.length} ${t('members')}` : null);
  const timestamp =
    typeof dm.lastMessage?.createdAt === 'number' ? dm.lastMessage.createdAt : dm.metadataUpdatedAt ?? 0;

  return (
    <li>
      <button
        onClick={() => navigate(`/channels/@me/${dm.id}`)}
        className={[
          'group flex w-full items-center gap-3 rounded-[10px] px-2 py-2.5 text-left',
          'transition-colors duration-200 hover:bg-white/[0.03] motion-reduce:transition-none',
          isFirst ? '' : 'border-t border-white/[0.04]',
        ].join(' ')}
      >
        {isGroup ? (
          <AvatarStack members={otherMembers} size={32} border="channel" iconUrl={dm.icon} />
        ) : (
          <Avatar
            src={firstOther?.avatar ?? null}
            name={
              firstOther
                ? firstOther.displayName ?? parseFederatedUsername(firstOther.username).baseName
                : headerName
            }
            size={32}
            status={firstOther?.status ?? null}
            userId={firstOther?.homeUserId ?? firstOther?.id}
            user={firstOther ?? undefined}
            className="flex-shrink-0"
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[13.5px] font-medium leading-[1.25] text-txt-primary transition-colors duration-200 group-hover:text-txt-secondary motion-reduce:transition-none">
            {headerName}
          </span>
          {previewText && (
            <span className="truncate text-[12px] leading-[1.3] text-txt-tertiary">
              {previewText}
            </span>
          )}
        </div>
        {timestamp > 0 && (
          <span className="flex-shrink-0 text-[10.5px] lowercase tracking-tight text-txt-tertiary/70">
            {formatDmTimestamp(timestamp)}
          </span>
        )}
      </button>
    </li>
  );
}

function ActivityRowItem({
  friend,
  activities,
  onClick,
}: {
  friend: Friend;
  activities: Activity[];
  onClick: (e: React.MouseEvent) => void;
}) {
  const canonical = useCanonicalUserView(friend as unknown as User);
  const { baseName } = parseFederatedUsername(canonical.username);
  const displayName = canonical.displayName ?? baseName;
  const primary = getPrimaryActivity(activities);
  const accentClass = primary ? getActivityAccentClass(primary.type) : '';

  const getActivityIcon = () => {
    if (!primary) return null;
    switch (primary.type) {
      case 'playing':
        return (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" className="flex-shrink-0">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        );
      case 'listening':
        return (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="flex-shrink-0">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        );
      case 'watching':
        return (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="flex-shrink-0">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        );
      case 'streaming':
        return (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="flex-shrink-0">
            <path d="M23 7l-7 5 7 5V7z" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div
      onClick={onClick}
      className={[
        'group relative flex cursor-pointer items-center gap-3.5 rounded-2xl border border-white/[0.05]',
        'bg-surface-base/35 px-4 py-4',
        'transition-all duration-200 hover:bg-surface-base/60 hover:border-white/[0.09] hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.3)]',
        'motion-reduce:transition-none',
        accentClass,
        'border-l-2',
      ].join(' ')}
    >
      <div className="relative flex-shrink-0">
        <Avatar
          src={canonical.avatar}
          name={displayName}
          size={40}
          status={canonical.status}
          userId={canonical.homeUserId ?? canonical.id}
          avatarColor={canonical.avatarColor}
        />
        {primary && (
          <div className={[
            'absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-surface-base',
            primary.type === 'playing' ? 'bg-accent-mint' :
            primary.type === 'listening' ? 'bg-accent-sky' :
            primary.type === 'watching' ? 'bg-accent-lavender' :
            primary.type === 'streaming' ? 'bg-accent-rose' :
            'bg-txt-tertiary'
          ].join(' ')}>
            {getActivityIcon()}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Username
            username={displayName}
            className="truncate text-[13.5px] font-semibold leading-[1.2] text-txt-primary"
          />
          {primary && (
            <span className={[
              'flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider',
              primary.type === 'playing' ? 'bg-accent-mint/20 text-accent-mint' :
              primary.type === 'listening' ? 'bg-accent-sky/20 text-accent-sky' :
              primary.type === 'watching' ? 'bg-accent-lavender/20 text-accent-lavender' :
              primary.type === 'streaming' ? 'bg-accent-rose/20 text-accent-rose' :
              'bg-white/10 text-txt-tertiary'
            ].join(' ')}>
              {primary.type}
            </span>
          )}
        </div>
        <div className="mt-1">
          <ActivityCard activities={activities} fallbackCustomStatus={canonical.customStatus} />
        </div>
      </div>
    </div>
  );
}

function ActivityEmptyState() {
  const { t } = useLanguage();
  return (
    <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-white/[0.05] bg-surface-base/20 px-6 py-12 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02]">
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-txt-tertiary/50"
        >
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      </div>
      <p className="text-[14px] font-medium text-txt-secondary">{t('home_no_activity_yet')}</p>
      <p className="mt-1.5 text-[12.5px] leading-[1.5] text-txt-tertiary/60 max-w-[280px]">
        {t('home_no_activity_hint')}
      </p>
    </div>
  );
}

function StatPill({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  // Count-up starts when the panel scrolls into view.
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  return (
    <div ref={ref} className="flex items-baseline justify-between py-1.5">
      <dt
        className={[
          'text-[10.5px] font-semibold uppercase tracking-[0.16em]',
          accent ? 'text-accent-primary' : 'text-txt-tertiary',
        ].join(' ')}
      >
        {label}
      </dt>
      <dd
        className={[
          'text-[22px] font-semibold leading-none tracking-[-0.03em] tabular-nums',
          accent ? 'text-txt-primary' : 'text-txt-primary',
        ].join(' ')}
      >
        {inView ? <CountUp value={value} /> : 0}
      </dd>
    </div>
  );
}

/**
 * Home “Música” section: my current Spotify track as the vinyl card, or a
 * connect prompt. Renders nothing while the connection status is loading so
 * the section never flashes an empty state.
 */
function MusicSection() {
  const { t } = useLanguage();
  const { connected, loaded, refresh } = useSpotifyStore();
  const myActivities = useActivityStore((s) => s.myActivities);
  const spotifyActivity = (myActivities ?? []).find((a) => a.type === 'spotify')?.spotify ?? null;

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!loaded) return null;

  return (
    <div id="home-music" className="scroll-mt-8">
      <SectionEyebrow label={t('spotify_home_title')} desc={t('spotify_home_desc')} />
      <div className="mt-4 max-w-[420px]">
        {connected && spotifyActivity ? (
          <SpotifyVinyl spotify={spotifyActivity} />
        ) : connected ? (
          <div className="rounded-2xl border border-white/[0.07] bg-[#0d0d0d] p-4 text-[12.5px] text-white/45">
            {t('spotify_nothing_playing')}
          </div>
        ) : (
          <a
            href={authorizeUrl()}
            onClick={(e) => {
              e.preventDefault();
              window.location.href = authorizeUrl();
            }}
            className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-[#0d0d0d] p-4 transition-colors hover:border-white/20"
          >
            <SpotifyGlyph className="h-5 w-5 flex-shrink-0 text-[#1DB954]" />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold text-white">{t('spotify_connect')}</p>
              <p className="truncate text-[11.5px] text-white/45">{t('spotify_connect_hint')}</p>
            </div>
            <span aria-hidden className="text-white/30">→</span>
          </a>
        )}
      </div>
    </div>
  );
}

export function HomePage({ mobile = false }: { mobile?: boolean }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const friends = useSocialStore((s) => s.friends);
  const requests = useSocialStore((s) => s.requests);
  const loadFriends = useSocialStore((s) => s.loadFriends);
  const loadRequests = useSocialStore((s) => s.loadRequests);
  const updateFriendRequest = useSocialStore((s) => s.updateFriendRequest);
  const dmChannels = useSpaceStore((s) => s.dmChannels);
  const spaces = useSpaceStore((s) => s.spaces);
  const unreadChannels = useChatStore((s) => s.unreadChannels);
  const userActivities = useActivityStore((s) => s.userActivities);
  const openModal = useUIStore((s) => s.openModal);
  const openUserProfile = useUIStore((s) => s.openUserProfile);
  const toggleMemberList = useUIStore((s) => s.toggleMemberList);
  const pushMobileScreen = useUIStore((s) => s.pushMobileScreen);

  useEffect(() => {
    loadFriends();
    loadRequests();
  }, [loadFriends, loadRequests]);

  const { activeFriends, onlineFriends } = useMemo(() => {
    const active: Friend[] = [];
    const online: Friend[] = [];
    for (const f of friends) {
      if (f.status === 'offline') continue;
      const activities = userActivities.get(f.homeUserId ?? f.id) ?? [];
      const primary = getPrimaryActivity(activities);
      if (primary && primary.type !== 'custom') active.push(f);
      else online.push(f);
    }
    return { activeFriends: active, onlineFriends: online };
  }, [friends, userActivities]);

  const pendingIncoming = useMemo(
    () => requests.filter((r) => r.status === 'pending' && !!r.user && r.user.id === r.fromId),
    [requests]
  );

  const recentDms = useMemo(() => dmChannels.slice(0, 5), [dmChannels]);

  if (!user) return null;

  const displayName = user.displayName ?? parseFederatedUsername(user.username).baseName;

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleQuickAction = (kind: QuickKind) => {
    switch (kind) {
      case 'explore':
        if (mobile) pushMobileScreen('explore');
        else navigate('/explore');
        break;
      case 'messages':
        if (mobile) scrollTo('home-recent');
        else openModal('newDm');
        break;
      case 'activity':
        if (mobile) scrollTo('home-activity');
        else toggleMemberList();
        break;
      case 'friends':
      default:
        scrollTo('home-social');
    }
  };

  const handleFriendOpen = (e: React.MouseEvent, friend: Friend) => {
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
      'left'
    );
  };

  const unreadCount = unreadChannels.size;
  const quickFriendsDesc =
    onlineFriends.length > 0
      ? t('home_count_online').replace('{count}', String(onlineFriends.length))
      : t('home_friends_desc_none');
  const quickMessagesDesc =
    unreadCount > 0 ? `${unreadCount} ${t('unread')}` : t('home_messages_desc_none');
  const quickActivityDesc =
    activeFriends.length > 0
      ? t('home_count_active').replace('{count}', String(activeFriends.length))
      : t('home_activity_quiet');

  const showRequests = pendingIncoming.length > 0;
  const visibleRequests = pendingIncoming.slice(0, 2);
  const socialStats = [
    t('friends_count').replace('{count}', String(friends.length)),
    onlineFriends.length > 0 ? t('online_count').replace('{count}', String(onlineFriends.length)) : null,
    pendingIncoming.length > 0 ? t('pending_count').replace('{count}', String(pendingIncoming.length)) : null,
  ].filter((s): s is string => !!s);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto no-scrollbar bg-surface-chat">
      <div
        className={[
          'mx-auto flex w-full min-w-0 flex-col',
          mobile
            ? 'px-5 py-7'
            : 'px-5 py-9 sm:px-6 sm:py-10 md:px-8 md:py-12 lg:px-10 lg:py-14 xl:px-12',
        ].join(' ')}
      >
        {/* ── HERO ────────────────────────────────────────────────── */}
        <header className="relative overflow-hidden">
          {/* Animated aurora — slow-drifting accent light behind the hero. */}
          <div aria-hidden className="home-hero-aurora home-hero-aurora-1" />
          <div aria-hidden className="home-hero-aurora home-hero-aurora-2" />

          {/* Subtle accent halo around the identity zone */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -left-24 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgb(var(--accent-primary-glow)/0.10),transparent_62%)] animate-home-halo motion-reduce:animate-home-halo"
          />

          {/* Editorial "V" watermark, partially off-canvas */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-8 -top-20 select-none sm:-right-6 sm:-top-16 md:-right-4 md:-top-20 lg:-right-4 lg:-top-24 xl:-top-28 animate-home-watermark motion-reduce:animate-home-watermark"
          >
            <span
              className="block font-semibold leading-[0.72] tracking-[-0.09em] text-[180px] text-[rgb(var(--accent-primary)/0.045)] sm:text-[220px] md:text-[280px] lg:text-[340px] xl:text-[380px]"
              style={{
                textShadow:
                  '0 0 140px rgb(var(--accent-primary-glow) / 0.18), 0 0 300px rgb(var(--accent-primary-glow) / 0.10)',
              }}
            >
              {t('home_hero_watermark')}
            </span>
          </div>

          <div className="relative flex flex-col items-center text-center gap-5 pb-8 md:pb-10 animate-home-fade-in-up">
            <span className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rounded-full bg-accent-primary animate-home-accent motion-reduce:animate-home-accent"
              />
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-txt-tertiary">
                {t('home_hero_eyebrow')}
              </span>
            </span>

            <h1 className="home-logo-glow text-[52px] font-semibold leading-[1] tracking-[-0.045em] text-txt-primary sm:text-[64px] md:text-[72px] md:leading-[0.96] md:tracking-[-0.05em] lg:text-[84px]">
              VERTEX<span className="text-accent-primary">.</span>
            </h1>

            <p className="max-w-[40ch] text-[15px] leading-[1.55] tracking-[-0.003em] text-txt-secondary md:text-[16px]">
              {t('home_tagline')}
            </p>

            <div className="mt-2 flex items-center gap-3">
              <span
                aria-hidden
                className="h-px w-8 bg-gradient-to-r from-accent-primary/60 to-transparent"
              />
              <p className="text-[12.5px] tracking-[0.01em] text-txt-tertiary">
                {t('home_welcome_back').replace('{name}', displayName)}
              </p>
              <span
                aria-hidden
                className="h-px w-8 bg-gradient-to-l from-accent-primary/60 to-transparent"
              />
            </div>
          </div>
        </header>

        {/* ── QUICK ACCESS ────────────────────────────────────────── */}
        <section
          aria-label={t('home_quick_access')}
          className="flex flex-col gap-3.5 animate-home-fade-in-up"
        >
          <SectionEyebrow label={t('home_quick_access')} desc={t('home_quick_access_desc')} />

          {/* Equal 4-column grid on desktop, 2-column on mobile */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 items-stretch">
            <div className="h-full min-h-0 animate-home-scale-in" style={{ animationDelay: '50ms' }}>
              <QuickModule
                kind="friends"
                label={t('home_section_quick_friends')}
                count={friends.length}
                desc={quickFriendsDesc}
                onClick={() => handleQuickAction('friends')}
              />
            </div>
            <div className="h-full min-h-0 animate-home-scale-in" style={{ animationDelay: '100ms' }}>
              <QuickModule
                kind="messages"
                label={t('home_section_quick_messages')}
                count={unreadCount}
                desc={quickMessagesDesc}
                onClick={() => handleQuickAction('messages')}
              />
            </div>
            <div className="h-full min-h-0 animate-home-scale-in" style={{ animationDelay: '150ms' }}>
              <QuickModule
                kind="activity"
                label={t('home_section_quick_activity')}
                count={activeFriends.length}
                desc={quickActivityDesc}
                onClick={() => handleQuickAction('activity')}
              />
            </div>
            <div className="h-full min-h-0 animate-home-scale-in" style={{ animationDelay: '200ms' }}>
              <QuickModule
                kind="explore"
                label={t('home_section_quick_explore')}
                count={null}
                desc={t('home_explore_desc')}
                onClick={() => handleQuickAction('explore')}
              />
            </div>
          </div>
        </section>

        {/* ── RECENT + SOCIAL / YOUR VERTEX ───────────────────────── */}
        <section className="mt-10 grid grid-cols-1 items-start gap-8 md:mt-14 lg:grid-cols-[1fr_200px] lg:gap-6 xl:grid-cols-[1fr_220px] xl:gap-8">
          <div className="flex min-w-0 flex-col gap-10 md:gap-12 animate-home-fade-in-up" style={{ animationDelay: '200ms' }}>
            {/* MUSIC — my Spotify listening card (hidden when not connected). */}
            <MusicSection />

            {/* RECENT */}
            <div id="home-recent" className="scroll-mt-8">
              <SectionEyebrow label={t('recent_dms')} desc={t('recent_dms_desc')} />
              {recentDms.length === 0 ? (
                <p className="mt-5 text-[13px] italic text-txt-tertiary/85">
                  {t('no_conversations')}
                </p>
              ) : (
                <ul className="mt-3 flex flex-col">
                  {recentDms.map((dm, i) => (
                    <RecentRow key={dm.id} dm={dm} currentUser={user} isFirst={i === 0} />
                  ))}
                </ul>
              )}
            </div>

            {/* SOCIAL */}
            <div id="home-social" className="scroll-mt-8">
              <SectionEyebrow label={t('home_social')} desc={t('home_social_desc')} />

              {showRequests && (
                <div className="mt-3 flex flex-col">
                  {visibleRequests.map((req) => (
                    <RequestRow
                      key={req.id}
                      request={req}
                      onAccept={() => updateFriendRequest(req.id, 'accepted')}
                      onDecline={() => updateFriendRequest(req.id, 'declined')}
                    />
                  ))}
                  {pendingIncoming.length > visibleRequests.length && (
                    <p className="px-2 pt-1 text-[11px] text-txt-tertiary/70">
                      +{pendingIncoming.length - visibleRequests.length} {t('more')}
                    </p>
                  )}
                </div>
              )}

              {onlineFriends.length > 0 ? (
                <div className="mt-4 flex items-center gap-2.5">
                  <div className="flex items-center">
                    {onlineFriends.slice(0, 8).map((f) => (
                      <div
                        key={f.id}
                        className="-ml-[7px] first:ml-0 transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                      >
                        <FriendAvatar user={f} size={26} />
                      </div>
                    ))}
                  </div>
                  <span className="text-[11.5px] text-txt-tertiary">
                    {t('home_count_online').replace('{count}', String(onlineFriends.length))}
                  </span>
                </div>
              ) : (
                <p className="mt-4 max-w-[44ch] text-[12.5px] leading-[1.55] text-txt-tertiary/80">
                  {t('home_social_empty')}
                </p>
              )}

              {socialStats.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1">
                  {socialStats.map((stat, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && <span aria-hidden className="text-txt-tertiary/40">·</span>}
                      <span className="text-[12px] text-txt-secondary">{stat}</span>
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* YOUR VERTEX */}
          <aside id="home-vertex" className="scroll-mt-8 min-w-0 animate-home-fade-in" style={{ animationDelay: '350ms' }}>
            <div className="sticky top-4 flex flex-col gap-3 rounded-2xl border border-white/[0.05] bg-surface-base/35 px-4 py-5 sm:px-5">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-block h-1 w-3 rounded-full bg-accent-primary/70"
                />
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-txt-tertiary">
                  {t('home_your_vertex')}
                </span>
              </div>
              <p className="text-[12px] leading-[1.45] text-txt-tertiary/80">
                {t('home_your_vertex_desc')}
              </p>

              <dl className="mt-2 flex flex-col">
                <div className="border-t border-white/[0.05]">
                  <StatPill label={t('friends')} value={friends.length} />
                </div>
                <div className="border-t border-white/[0.04]">
                  <StatPill label={t('spaces')} value={spaces.length} />
                </div>
                <div className="border-t border-white/[0.04]">
                  <StatPill label={t('unread')} value={unreadCount} accent={unreadCount > 0} />
                </div>
                <div className="border-t border-white/[0.04]">
                  <StatPill label={t('activity')} value={activeFriends.length} accent={activeFriends.length > 0} />
                </div>
              </dl>
            </div>
          </aside>
        </section>

        {/* ── ACTIVITY ────────────────────────────────────────────── */}
        <section id="home-activity" className="mt-10 scroll-mt-8 md:mt-14 animate-home-fade-in-up" style={{ animationDelay: '400ms' }}>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.025]">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-txt-tertiary"
              >
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <div className="flex items-center gap-3">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-txt-tertiary">
                  {t('activity')}
                </span>
                <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-white/[0.09] to-transparent" />
              </div>
              <p className="text-[12px] leading-[1.45] text-txt-tertiary/80">{t('home_activity_desc')}</p>
            </div>
          </div>
          {activeFriends.length === 0 ? (
            <ActivityEmptyState />
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:gap-3 xl:grid-cols-3">
              {activeFriends.slice(0, 6).map((f) => (
                <ActivityRowItem
                  key={f.id}
                  friend={f}
                  activities={userActivities.get(f.homeUserId ?? f.id) ?? []}
                  onClick={(e) => handleFriendOpen(e, f)}
                />
              ))}
            </div>
          )}
        </section>

        <div className="pb-8 md:pb-4" />
      </div>
    </div>
  );
}
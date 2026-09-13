import React, { useCallback, useMemo, useState } from 'react';
import type { Activity, User } from '@backspace/shared';
import { getPrimaryActivity } from '@backspace/shared/src/activities.js';
import { Avatar } from '../ui/Avatar';
import { useCanonicalUserView } from '../../utils/userViewLookup';
import { parseFederatedUsername } from '../../utils/identity';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuthStore } from '../../stores/authStore';
import { useSocialStore } from '../../stores/socialStore';
import { useContextMenuStore } from '../../stores/contextMenuStore';
import { useUIStore } from '../../stores/uiStore';
import { buildUserContextMenuItems } from '../../utils/userContextMenu';
import { pointAnchor } from '../../hooks/useFloatingPosition';
import { PRESENCE_META } from '../../utils/presence';

/**
 * Netrex "Cuadrícula Compacta de Miembros" (feature: memberGridCompact).
 *
 * Discord-style dense avatar grid with a collapsible "Group Members" header and
 * an "Activity (Active Now)" feed underneath, rendered with relative times and
 * fading skeleton placeholder rows. Callers gate rendering on
 * `useNetrexFeatureActive('memberGridCompact')` — this component never checks
 * the entitlement itself.
 */

const INITIAL_VISIBLE = 12;
const SKELETON_ROWS = 4;
const CELL_SIZE = 38;

/** Grid status dots come from the shared presence map — never local palettes. */
const DOT_COLORS: Record<string, string> = {
  online: PRESENCE_META.online.hex,
  idle: PRESENCE_META.idle.hex,
  dnd: PRESENCE_META.dnd.hex,
};

/** Compact elapsed label ("now", "11 min", "3 hr", "2 d") matching the reference design. */
function formatElapsed(startMs: number): string {
  const elapsed = Date.now() - startMs;
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return 'now';
  const hours = Math.floor(minutes / 60);
  if (hours < 1) return `${minutes} min`;
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} d`;
  return `${hours} hr`;
}

const VERB_KEY: Record<Activity['type'], string> = {
  playing: 'compact_grid_verb_playing',
  listening: 'compact_grid_verb_listening',
  watching: 'compact_grid_verb_watching',
  streaming: 'compact_grid_verb_streaming',
  spotify: 'compact_grid_verb_spotify',
  custom: 'compact_grid_verb_status',
};

function StatusDot({ status }: { status: 'online' | 'idle' | 'dnd' | 'offline' }) {
  if (status === 'offline') return null;
  return (
    <span
      className="absolute bottom-0 right-0 rounded-full border-2 border-[var(--surface-base)]"
      style={{ width: 11, height: 11, backgroundColor: DOT_COLORS[status] ?? DOT_COLORS.online }}
    />
  );
}

function GridCell({
  user,
  onMemberClick,
}: {
  user: User;
  onMemberClick: (e: React.MouseEvent, user: User) => void;
}) {
  const canonical = useCanonicalUserView(user);
  const { baseName } = parseFederatedUsername(canonical.username);
  const displayName = canonical.displayName ?? baseName;

  const { t } = useLanguage();
  const me = useAuthStore((s) => s.user);
  const openUserProfile = useUIStore((s) => s.openUserProfile);
  const openContextMenu = useContextMenuStore((s) => s.open);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openContextMenu(
      { x: e.clientX, y: e.clientY },
      buildUserContextMenuItems({
        user: canonical,
        me,
        friends: useSocialStore.getState().friends,
        requests: useSocialStore.getState().requests,
        t,
        onViewProfile: (u) => openUserProfile(u, pointAnchor(e.clientX, e.clientY), 'left'),
        onAddFriend: () => useSocialStore.getState().sendFriendRequest(canonical.username).catch(() => {}),
        onRemoveFriend: () => {
          const f = useSocialStore.getState().friends.find((fr) => fr.id === canonical.id);
          if (f) useSocialStore.getState().removeFriend(f.id).catch(() => {});
        },
        onCancelRequest: () => {
          const s = useSocialStore.getState();
          const req = s.requests.find((r) => r.user && (r.user.homeUserId ?? r.user.id) === (canonical.homeUserId ?? canonical.id));
          if (req) s.cancelFriendRequest(req.id).catch(() => {});
        },
        onAcceptRequest: () => {
          const s = useSocialStore.getState();
          const req = s.requests.find((r) => r.user && (r.user.homeUserId ?? r.user.id) === (canonical.homeUserId ?? canonical.id));
          if (req) s.updateFriendRequest(req.id, 'accepted').catch(() => {});
        },
        onDeclineRequest: () => {
          const s = useSocialStore.getState();
          const req = s.requests.find((r) => r.user && (r.user.homeUserId ?? r.user.id) === (canonical.homeUserId ?? canonical.id));
          if (req) s.updateFriendRequest(req.id, 'declined').catch(() => {});
        },
      }),
    );
  }, [canonical, me, t, openContextMenu, openUserProfile]);

  return (
    <button
      onClick={(e) => onMemberClick(e, canonical)}
      onContextMenu={handleContextMenu}
      className="relative rounded-full hover:opacity-80 transition-opacity"
      style={{ width: CELL_SIZE, height: CELL_SIZE }}
      title={displayName}
      aria-label={displayName}
    >
      <Avatar
        src={canonical.avatar}
        name={displayName}
        size={CELL_SIZE}
        userId={canonical.homeUserId ?? canonical.id}
        avatarColor={canonical.avatarColor}
      />
      {canonical.status && <StatusDot status={canonical.status} />}
    </button>
  );
}

interface ActivityRowData {
  key: string;
  user: User;
  displayName: string;
  text: string;
  time: string | null;
}

function ActivityRow({
  row,
  onMemberClick,
}: {
  row: ActivityRowData;
  onMemberClick: (e: React.MouseEvent, user: User) => void;
}) {
  return (
    <div
      onClick={(e) => onMemberClick(e, row.user)}
      className="flex items-center gap-2.5 px-1 py-1.5 rounded-lg cursor-pointer hover:bg-white/[0.03] transition-colors"
    >
      <Avatar
        src={row.user.avatar}
        name={row.displayName}
        size={26}
        status={row.user.status}
        userId={row.user.homeUserId ?? row.user.id}
        avatarColor={row.user.avatarColor}
        className="flex-shrink-0"
      />
      <div className="flex-1 min-w-0 text-[11px] leading-[1.35] truncate">
        <span className="font-semibold text-txt-primary">{row.displayName}</span>{' '}
        <span className="text-txt-secondary">{row.text}</span>
      </div>
      {row.time && (
        <span className="text-[9.5px] text-txt-tertiary tabular-nums flex-shrink-0">{row.time}</span>
      )}
    </div>
  );
}

export interface CompactMembersGridProps {
  /** Online users to display (offline members are rendered by the caller). */
  users: User[];
  /** Activity lookup — keys differ between HOME (homeUserId) and servers (id). */
  getActivities: (user: User) => Activity[];
  onMemberClick: (e: React.MouseEvent, user: User) => void;
  /** "+" button action (add friend / invite, depending on context). */
  onAddClick: () => void;
  addTitle?: string;
  /** Render the "Activity (Active Now)" section. Off when the host panel already has its own feed. */
  showActivityFeed?: boolean;
}

export function CompactMembersGrid({ users, getActivities, onMemberClick, onAddClick, addTitle, showActivityFeed = true }: CompactMembersGridProps) {
  const { t } = useLanguage();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedAll, setExpandedAll] = useState(false);
  const me = useAuthStore((s) => s.user);

  // Include the current user in the grid + activity feed (deduped by id).
  const allUsers = useMemo(() => {
    if (!me) return users;
    const meCanonical = {
      ...me,
      // Home users may not carry homeUserId on the auth row; normalize so the
      // activity lookup key matches the feed's homeUserId-first convention.
      homeUserId: me.homeUserId ?? me.id,
    };
    const myId = me.homeUserId ?? me.id;
    const alreadyIncluded = users.some((u) => (u.homeUserId ?? u.id) === myId);
    return alreadyIncluded ? users : [meCanonical as User, ...users];
  }, [users, me]);

  const visible = expandedAll ? allUsers : allUsers.slice(0, INITIAL_VISIBLE);
  const remaining = allUsers.length - visible.length;

  const activityRows = useMemo<ActivityRowData[]>(() => {
    const rows: ActivityRowData[] = [];
    for (const raw of allUsers) {
      const canonical = raw;
      const { baseName } = parseFederatedUsername(canonical.username);
      const displayName = canonical.displayName ?? baseName;
      const primary = getPrimaryActivity(getActivities(canonical));
      if (!primary) {
        // No rich activity — still show the user as active: "X · Online".
        // Only for users actually connected (self is connected by definition).
        const isSelf = me != null && (canonical.homeUserId ?? canonical.id) === (me.homeUserId ?? me.id);
        if (!isSelf && canonical.status === 'offline') continue;
        rows.push({
          key: canonical.homeUserId ?? canonical.id,
          user: canonical,
          displayName,
          text: t('online_no_activity'),
          time: null,
        });
        continue;
      }
      const verbKey = VERB_KEY[primary.type] ?? VERB_KEY.custom;
      const text =
        primary.type === 'custom'
          ? t(verbKey)
          : t(verbKey).replace('{activity}', primary.name ?? primary.details ?? '');
      rows.push({
        key: canonical.homeUserId ?? canonical.id,
        user: canonical,
        displayName,
        text,
        time: primary.timestamps?.start ? formatElapsed(primary.timestamps.start) : null,
      });
    }
    return rows;
  }, [allUsers, getActivities, t, me]);

  const toggleCollapsed = useCallback(() => setCollapsed((c) => !c), []);

  return (
    <div>
      {/* ── Collapsible header ── */}
      <div className="flex items-center justify-between px-1 mb-2">
        <button
          onClick={toggleCollapsed}
          className="flex items-center gap-1.5 min-w-0 text-txt-primary hover:text-txt-secondary transition-colors"
          aria-expanded={!collapsed}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span className="text-[12px] font-bold truncate">{t('netrex_activity_group_members')}</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`flex-shrink-0 transition-transform duration-300 ${collapsed ? '-rotate-90' : 'rotate-0'}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <span className="flex-shrink-0 text-txt-tertiary" title={t('netrex_activity_group_members')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h10" />
          </svg>
        </span>
      </div>

      {/* ── Collapsible body (smooth height + opacity animation) ── */}
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight: collapsed ? 0 : 1200, opacity: collapsed ? 0 : 1 }}
        aria-hidden={collapsed}
      >
        {/* Dense avatar grid */}
        {allUsers.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-1 mb-3">
            {visible.map((u) => (
              <GridCell key={u.homeUserId ?? u.id} user={u} onMemberClick={onMemberClick} />
            ))}
            {remaining > 0 && (
              <button
                onClick={() => setExpandedAll(true)}
                className="rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-[11px] font-bold text-txt-secondary hover:bg-white/[0.1] hover:text-txt-primary transition-colors"
                style={{ width: CELL_SIZE, height: CELL_SIZE }}
                title={t('show_more_members').replace('{count}', String(remaining))}
                aria-label={t('show_more_members').replace('{count}', String(remaining))}
              >
                +{remaining}
              </button>
            )}
            {expandedAll && allUsers.length > INITIAL_VISIBLE && (
              <button
                onClick={() => setExpandedAll(false)}
                className="rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-[13px] font-bold text-txt-secondary hover:bg-white/[0.1] hover:text-txt-primary transition-colors"
                style={{ width: CELL_SIZE, height: CELL_SIZE }}
                title={t('show_less_members')}
                aria-label={t('show_less_members')}
              >
                −
              </button>
            )}
            <button
              onClick={onAddClick}
              className="rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-txt-secondary hover:bg-white/[0.1] hover:text-txt-primary transition-colors"
              style={{ width: CELL_SIZE, height: CELL_SIZE }}
              title={addTitle ?? t('add_friend')}
              aria-label={addTitle ?? t('add_friend')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="8" r="3.5" />
                <path d="M2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5" />
                <path d="M18 8v6M15 11h6" />
              </svg>
            </button>
          </div>
        )}

        {/* Activity (Active Now) feed */}
        {showActivityFeed && (
        <div className="px-1 pb-1">
          <div className="flex items-center gap-1.5 mb-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-txt-tertiary flex-shrink-0">
              <rect x="2" y="7" width="6" height="10" rx="1.5" />
              <rect x="9" y="4" width="6" height="13" rx="1.5" />
              <rect x="16" y="9" width="6" height="8" rx="1.5" />
            </svg>
            <span className="text-[12px] font-bold text-txt-primary">{t('compact_grid_activity_label')}</span>
            <span className="text-[10px] text-txt-tertiary">{t('compact_grid_active_now')}</span>
          </div>

          {activityRows.length === 0 ? (
            <p className="text-[10.5px] text-txt-tertiary px-1 py-1.5">{t('amp_no_activity')}</p>
          ) : (
            <div>
              {activityRows.map((row) => (
                <ActivityRow key={row.key} row={row} onMemberClick={onMemberClick} />
              ))}
            </div>
          )}

          {/* Fading skeleton placeholder rows */}
          <div className="mt-1" aria-hidden="true">
            {Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 px-1 py-1.5"
                style={{ opacity: Math.max(0.12, 1 - i * 0.25) }}
              >
                <div className="skeleton skeleton-circle w-[26px] h-[26px] flex-shrink-0" style={{ animationDelay: `${i * 0.1}s` }} />
                <div className="skeleton skeleton-bar h-2" style={{ width: `${58 - i * 9}%`, animationDelay: `${i * 0.1}s` }} />
                <div className="flex-1" />
                <div className="skeleton skeleton-bar h-2 w-8 flex-shrink-0" style={{ animationDelay: `${i * 0.1}s` }} />
              </div>
            ))}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

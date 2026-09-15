import React, { useMemo, useState } from 'react';
import type { Activity, MemberWithUser } from '@vertex/shared';
import { useSpaceStore } from '../../stores/spaceStore';
import { useUIStore } from '../../stores/uiStore';
import { useActivityStore } from '../../stores/activityStore';
import { Avatar } from '../ui/Avatar';
import { Username } from '../ui/Username';
import { hasRichActivity, getActivityAccentClass } from '../ui/ActivityCard';
import { getPrimaryActivity } from '@vertex/shared/src/activities.js';
import { parseFederatedUsername } from '../../utils/identity';
import { useCanonicalUserView } from '../../utils/userViewLookup';
import { useDelayedLoading } from '../../hooks/useDelayedLoading';
import { useLanguage } from '../../contexts/LanguageContext';
import { getMemberGroup, MemberSidebarRow } from './MemberSidebar';
import { StaffBadge, NetrexChip } from '../ui/StaffBadge';
import { useNetrexPrefsStore } from '../../stores/netrexPrefsStore';
import { CompactMembersGrid } from './CompactMembersGrid';

const INITIAL_GRID_COUNT = 24;

type ActivityMemberMode = 'activity' | 'standard';

/** Compact relative time ("12m", "3h", "2d") consistent with ActivityCard's elapsed style. */
function formatRelative(startMs: number): string {
  const elapsed = Date.now() - startMs;
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return '1m';
  const hours = Math.floor(minutes / 60);
  if (hours < 1) return `${minutes}m`;
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d`;
  return `${hours}h`;
}

const ACTIVITY_GROUP_LABEL: Record<Activity['type'], string> = {
  playing: 'activity_playing',
  listening: 'activity_listening',
  watching: 'activity_watching',
  streaming: 'activity_streaming',
  spotify: 'activity_spotify',
  custom: 'activity_custom',
};

const ACTIVITY_TYPE_TEXT_CLASS: Record<Activity['type'], string> = {
  playing: 'text-accent-mint',
  listening: 'text-accent-sky',
  watching: 'text-accent-lavender',
  streaming: 'text-accent-rose',
  spotify: 'text-[#1DB954]',
  custom: 'text-txt-tertiary',
};

function ActivityActionIcon({ type }: { type: Activity['type'] }) {
  const cls = 'flex-shrink-0';
  switch (type) {
    case 'playing':
      return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M6 12h4m-2-2v4M15 11h.01M18 13h.01M4 8l4.5-3 7 2.5L20 6l2 1.5v8L16 19l-7-2.5L4 15l-2-1V8z" />
        </svg>
      );
    case 'listening':
      return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M3 18v-6a9 9 0 0118 0v6" />
          <path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3v5zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3v5z" />
        </svg>
      );
    case 'watching':
      return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <rect x="2" y="4" width="20" height="14" rx="2" />
          <path d="M10 9l5 3-5 3V9z" fill="currentColor" stroke="none" opacity="0.85" />
        </svg>
      );
    case 'streaming':
      return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M2 8a14 14 0 0120 0M5.5 11a9.5 9.5 0 0113 0M9 14a5 5 0 016 0" />
          <circle cx="12" cy="17" r="1.6" fill="currentColor" stroke="none" />
        </svg>
      );
    default:
      return null;
  }
}

function ActivityMemberRow({
  member,
  primary,
  accentClass,
  onClickMember,
}: {
  member: MemberWithUser;
  primary: Activity;
  accentClass: string;
  onClickMember: (e: React.MouseEvent, user: MemberWithUser['user']) => void;
}) {
  const canonical = useCanonicalUserView(member.user);
  const { baseName } = parseFederatedUsername(canonical.username);
  const displayName = canonical.displayName ?? baseName;
  const time = primary.timestamps?.start ? formatRelative(primary.timestamps.start) : null;

  return (
    <div
      onClick={(e) => onClickMember(e, canonical)}
      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] mb-1 cursor-pointer transition-colors glass-pill border-l-2 ${accentClass}`}
    >
      <Avatar
        src={canonical.avatar}
        name={displayName}
        size={28}
        status={canonical.status}
        user={canonical}
        className="flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1">
          <Username
            username={displayName}
            className="text-[12.5px] leading-[1.2] font-medium truncate text-txt-primary"
          />
          {canonical.staffRole && <StaffBadge role={canonical.staffRole} />}
          {canonical.netrexEnabled && <NetrexChip />}
          {time && <span className="text-[9px] text-txt-tertiary tabular-nums flex-shrink-0">{time}</span>}
        </div>
        <div className="text-[10.5px] leading-[1.3] text-txt-secondary truncate">
          {primary.name}
          {(primary.details || primary.state) ? ` — ${primary.details ?? primary.state}` : ''}
        </div>
      </div>
      <span className={`flex-shrink-0 ${ACTIVITY_TYPE_TEXT_CLASS[primary.type]}`}>
        <ActivityActionIcon type={primary.type} />
      </span>
    </div>
  );
}

function MemberGridCell({
  member,
  onClickMember,
}: {
  member: MemberWithUser;
  onClickMember: (e: React.MouseEvent, user: MemberWithUser['user']) => void;
}) {
  const canonical = useCanonicalUserView(member.user);
  const { baseName } = parseFederatedUsername(canonical.username);
  const displayName = canonical.displayName ?? baseName;

  return (
    <button
      onClick={(e) => onClickMember(e, canonical)}
      className="flex flex-col items-center gap-0.5 p-1 rounded-lg hover:bg-interactive-hover transition-colors"
      title={displayName}
    >
      <Avatar
        src={canonical.avatar}
        name={displayName}
        size={36}
        status={canonical.status}
        user={canonical}
      />
      <span className="text-[8px] text-txt-tertiary truncate w-full text-center leading-tight">
        {displayName}
      </span>
    </button>
  );
}

export function ActivityMemberPanel() {
  const { t } = useLanguage();
  const members = useSpaceStore((s) => s.members);
  const spaces = useSpaceStore((s) => s.spaces);
  const currentSpaceId = useSpaceStore((s) => s.currentSpaceId);
  const loadingSpaceId = useSpaceStore((s) => s.loadingSpaceId);
  const memberListOpen = useUIStore((s) => s.memberListOpen);
  const openUserProfile = useUIStore((s) => s.openUserProfile);
  const openModal = useUIStore((s) => s.openModal);
  const userActivities = useActivityStore((s) => s.userActivities);

  // Netrex feature preferences (Hub-controlled). The panel itself is only
  // rendered when the entitlement is active (see RightPanel), so this store
  // value is a pure layout preference.
  const hubPanelMode = useNetrexPrefsStore((s) => s.memberPanelMode);
  const compactGrid = useNetrexPrefsStore((s) => s.activeFeatures.includes('memberGridCompact'));

  const [mode, setMode] = useState<ActivityMemberMode>(hubPanelMode);
  const [gridExpanded, setGridExpanded] = useState(false);

  const space = spaces.find(s => s.id === currentSpaceId);
  const ownerId = space?.ownerId;

  const { roleGroups, offlineMembers, onlineMembers } = useMemo(() => {
    const online = members.filter(m => m.user.status !== 'offline');
    const offline = members.filter(m => m.user.status === 'offline');

    const groups = new Map<string, { label: string; color: string | undefined; position: number; members: MemberWithUser[] }>();
    for (const m of online) {
      const group = getMemberGroup(m, ownerId, t);
      if (!groups.has(group.key)) {
        groups.set(group.key, { label: group.label, color: group.color, position: group.position, members: [] });
      }
      groups.get(group.key)!.members.push(m);
    }

    const sorted = [...groups.entries()].sort((a, b) => b[1].position - a[1].position);

    return { roleGroups: sorted, offlineMembers: offline, onlineMembers: online };
  }, [members, ownerId, t]);

  // Group online members by their primary activity type (priority order).
  const activityGroups = useMemo(() => {
    const byType = new Map<Activity['type'], MemberWithUser[]>();
    const order: Activity['type'][] = ['playing', 'streaming', 'listening', 'spotify', 'watching', 'custom'];
    const noActivity: MemberWithUser[] = [];
    for (const m of onlineMembers) {
      const primary = getPrimaryActivity(userActivities.get(m.userId) ?? []);
      if (!primary) {
        // Online without activity — rendered in the "Online" section below.
        noActivity.push(m);
        continue;
      }
      if (!byType.has(primary.type)) byType.set(primary.type, []);
      byType.get(primary.type)!.push(m);
    }
    return {
      groups: order
        .filter((type) => (byType.get(type)?.length ?? 0) > 0)
        .map((type) => ({ type, members: byType.get(type)! })),
      onlineWithoutActivity: noActivity,
    };
  }, [onlineMembers, userActivities]);

  const isLoadingSpace = !!loadingSpaceId && loadingSpaceId === currentSpaceId;
  const showMemberSkeleton = useDelayedLoading(isLoadingSpace);

  if (!memberListOpen) return null;

  const getMemberColor = (member: MemberWithUser): React.CSSProperties | undefined => {
    if (member.roles && member.roles.length > 0) {
      const sorted = [...member.roles].sort((a, b) => b.position - a.position);
      return { color: sorted[0]!.color };
    }
    if (ownerId && member.userId === ownerId) {
      return { color: 'rgb(var(--accent-rose))' };
    }
    return undefined;
  };

  const handleMemberClick = (e: React.MouseEvent, user: MemberWithUser['user']) => {
    e.stopPropagation();
    openUserProfile(user, e.currentTarget.getBoundingClientRect(), 'left');
  };

  const renderMember = (member: MemberWithUser, isOffline = false) => {
    const colorStyle = isOffline ? undefined : getMemberColor(member);
    const activities = userActivities.get(member.userId) ?? [];
    const isRichActivity = !isOffline && hasRichActivity(activities);
    const primary = getPrimaryActivity(activities);
    const accentClass = primary ? getActivityAccentClass(primary.type) : '';
    return (
      <MemberSidebarRow
        key={member.userId}
        member={member}
        isOffline={isOffline}
        colorStyle={colorStyle}
        activities={activities}
        isRichActivity={isRichActivity}
        accentClass={accentClass}
        onClickMember={handleMemberClick}
      />
    );
  };

  const expanded = gridExpanded || onlineMembers.length <= INITIAL_GRID_COUNT;
  const gridMembers = expanded ? onlineMembers : onlineMembers.slice(0, INITIAL_GRID_COUNT);
  const remaining = onlineMembers.length - gridMembers.length;

  return (
    <div className="w-60 bg-surface-members flex-shrink-0 overflow-y-auto select-none no-scrollbar hidden md:block border-l border-border-hard">
      {showMemberSkeleton ? (
        <div className="px-3 pt-4" role="status" aria-label={t('loading_members')}>
          <div className="skeleton skeleton-bar h-2 w-[45%] mb-3" style={{ animationDelay: '0s' }} />
          <div className="grid grid-cols-4 gap-2 mb-5">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="skeleton skeleton-circle w-9 h-9 ml-auto mr-auto" style={{ animationDelay: `${i * 0.08}s` }} />
            ))}
          </div>
          <div className="skeleton skeleton-bar h-2 w-[55%] mb-4" style={{ animationDelay: '0.25s' }} />
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-2.5 py-1.5 mb-1" style={{ animationDelay: `${(i + 1) * 0.12}s` }}>
              <div className="skeleton skeleton-circle w-8 h-8 flex-shrink-0" style={{ animationDelay: `${(i + 1) * 0.12}s` }} />
              <div className="skeleton skeleton-bar" style={{ width: `${45 + (i * 19) % 30}%`, animationDelay: `${(i + 1) * 0.12}s` }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col h-full">
          {/* ── Header ── */}
          <div className="px-3 pt-3 pb-2 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[12px] font-bold text-txt-primary">✦ {t('netrex_activity_panel_title')}</span>
                <span className="px-1.5 py-px rounded-full bg-white/[0.05] border border-white/[0.06] text-[9px] font-bold text-txt-tertiary">
                  {members.length}
                </span>
              </div>
              <button
                onClick={() => openModal('invite')}
                className="flex-shrink-0 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.07] text-[10px] font-semibold text-txt-secondary hover:bg-white/[0.08] hover:text-txt-primary transition-colors"
              >
                {t('netrex_activity_invite')}
              </button>
            </div>

            {/* Mode switcher */}
            <div className="flex gap-1 p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
              {([
                { id: 'activity', label: t('netrex_activity_mode_activity') },
                { id: 'standard', label: t('netrex_activity_mode_standard') },
              ] as const).map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`flex-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                    mode === m.id ? 'bg-white/[0.08] text-txt-primary' : 'text-txt-tertiary hover:text-txt-secondary'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Scroll body ── */}
          <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 no-scrollbar">
            {mode === 'activity' ? (
              <div className="space-y-2">
                {/* Avatar grid */}
                {onlineMembers.length > 0 && (
                  <div className="pt-1">
                    <div className="flex items-center justify-between px-1 mb-1.5">
                      <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-txt-tertiary">
                        {t('netrex_activity_group_members')}
                      </span>
                      <span className="text-[9px] text-txt-tertiary tabular-nums">{onlineMembers.length}</span>
                    </div>
                    {/* Netrex "Cuadrícula Compacta de Miembros": Discord-style dense grid.
                        Without the feature the classic 4/6-column grid renders below. */}
                    {compactGrid ? (
                      <CompactMembersGrid
                        users={onlineMembers.map((m) => m.user)}
                        getActivities={(u) => userActivities.get(u.homeUserId ?? u.id) ?? []}
                        onMemberClick={handleMemberClick}
                        onAddClick={() => openModal('invite')}
                        addTitle={t('netrex_activity_invite')}
                        showActivityFeed={false}
                      />
                    ) : (
                      <>
                        <div className={`grid gap-1.5 grid-cols-4`}>
                          {gridMembers.map((m) => (
                            <MemberGridCell key={m.userId} member={m} onClickMember={handleMemberClick} />
                          ))}
                        </div>
                        {!expanded && remaining > 0 && (
                          <button
                            onClick={() => setGridExpanded(true)}
                            className="w-full mt-1.5 px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[10px] font-semibold text-txt-secondary hover:bg-white/[0.08] hover:text-txt-primary transition-colors"
                          >
                            {t('show_more_members').replace('{count}', String(remaining))}
                          </button>
                        )}
                        {expanded && gridExpanded && onlineMembers.length > INITIAL_GRID_COUNT && (
                          <button
                            onClick={() => setGridExpanded(false)}
                            className="w-full mt-1.5 px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[10px] font-semibold text-txt-secondary hover:bg-white/[0.08] hover:text-txt-primary transition-colors"
                          >
                            {t('show_less_members')}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Activity feed */}
                <div className="pt-2">
                  <div className="flex items-center gap-2 px-1 mb-2">
                    <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-txt-tertiary">
                      {t('netrex_activity_active_now')}
                    </span>
                    <span className="h-px flex-1 bg-white/[0.05]" />
                  </div>
                  {activityGroups.groups.length === 0 && activityGroups.onlineWithoutActivity.length === 0 ? (
                    <p className="text-[10.5px] text-txt-tertiary px-1 py-2">{t('amp_no_activity')}</p>
                  ) : (
                    <div className="space-y-3">
                      {activityGroups.groups.map((group) => (
                        <div key={group.type}>
                          <div className="flex items-center gap-1.5 px-1 mb-1">
                            <span
                              className={`w-1 h-1 rounded-full ${
                                group.type === 'playing' ? 'bg-accent-mint'
                                : group.type === 'listening' ? 'bg-accent-sky'
                                : group.type === 'watching' ? 'bg-accent-lavender'
                                : 'bg-accent-rose'
                              }`}
                            />
                            <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-txt-tertiary">
                              {t(ACTIVITY_GROUP_LABEL[group.type])}
                            </span>
                            <span className="text-[9px] text-txt-tertiary/70 tabular-nums">{group.members.length}</span>
                          </div>
                          {group.members.map((m) => {
                            const primary = getPrimaryActivity(userActivities.get(m.userId) ?? [])!;
                            const accentClass = getActivityAccentClass(primary.type);
                            return (
                              <ActivityMemberRow
                                key={m.userId}
                                member={m}
                                primary={primary}
                                accentClass={accentClass}
                                onClickMember={handleMemberClick}
                              />
                            );
                          })}
                        </div>
                      ))}

                      {/* Online members without a rich activity: "X · Online" */}
                      {activityGroups.onlineWithoutActivity.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 px-1 mb-1">
                            <span className="w-1 h-1 rounded-full bg-status-online" />
                            <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-txt-tertiary">
                              {t('online')}
                            </span>
                            <span className="text-[9px] text-txt-tertiary/70 tabular-nums">
                              {activityGroups.onlineWithoutActivity.length}
                            </span>
                          </div>
                          {activityGroups.onlineWithoutActivity.map((m) => renderMember(m))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Offline */}
                {offlineMembers.length > 0 && (
                  <div className="pt-2">
                    <h3 className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-txt-tertiary px-1 mb-1">
                      {t('offline')} — {offlineMembers.length}
                    </h3>
                    {offlineMembers.map((m) => renderMember(m, true))}
                  </div>
                )}
              </div>
            ) : (
              <div className="pt-1">
                {roleGroups.map(([key, group]) => (
                  <div key={key} className="mb-4">
                    <h3 className="text-[10.5px] font-bold text-txt-tertiary uppercase tracking-[0.06em] px-2 mb-1">
                      {group.label} — {group.members.length}
                    </h3>
                    {group.members.map((m) => renderMember(m))}
                  </div>
                ))}
                {offlineMembers.length > 0 && (
                  <div>
                    <h3 className="text-[10.5px] font-bold text-txt-tertiary uppercase tracking-[0.06em] px-2 mb-1">
                      {t('offline')} — {offlineMembers.length}
                    </h3>
                    {offlineMembers.map((m) => renderMember(m, true))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
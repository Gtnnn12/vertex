import React, { useEffect, useMemo, useState } from 'react';
import type { Activity, Channel, MemberWithUser } from '@backspace/shared';
import { useSpaceStore } from '../../stores/spaceStore';
import { useUIStore } from '../../stores/uiStore';
import { useActivityStore } from '../../stores/activityStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { useAuthStore } from '../../stores/authStore';
import { Avatar } from '../ui/Avatar';
import { Username } from '../ui/Username';
import { hasRichActivity, getActivityAccentClass } from '../ui/ActivityCard';
import { getPrimaryActivity } from '@backspace/shared/src/activities.js';
import { parseFederatedUsername } from '../../utils/identity';
import { useCanonicalUserView } from '../../utils/userViewLookup';
import { useDelayedLoading } from '../../hooks/useDelayedLoading';
import { useLanguage } from '../../contexts/LanguageContext';
import { getMemberGroup, MemberSidebarRow } from './MemberSidebar';
import { StaffBadge, NetrexChip } from '../ui/StaffBadge';
import { useNetrexPrefsStore } from '../../stores/netrexPrefsStore';
import { CompactMembersGrid } from './CompactMembersGrid';

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

/** Section header for the grouped (activity-mode) member list. */
function AmpSectionHeader({ dotClass, label, count }: { dotClass: string; label: string; count: number }) {
  return (
    <div className="flex items-center gap-1.5 px-1 mb-1">
      <span className={`w-1 h-1 rounded-full ${dotClass}`} />
      <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-txt-tertiary">{label}</span>
      <span className="text-[9px] text-txt-tertiary/70 tabular-nums">{count}</span>
    </div>
  );
}

function ActivityMemberRow({
  member,
  primary,
  accentClass,
  colorStyle,
  onClickMember,
}: {
  member: MemberWithUser;
  primary: Activity;
  accentClass: string;
  colorStyle: React.CSSProperties | undefined;
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
            className={`text-[12.5px] leading-[1.2] font-medium truncate ${colorStyle ? '' : 'text-txt-primary'}`}
            style={colorStyle}
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

/** Row for the "In voice" section: username on top, voice channel underneath. */
function VoiceMemberRow({
  member,
  channelName,
  colorStyle,
  onClickMember,
}: {
  member: MemberWithUser;
  channelName: string | null;
  colorStyle: React.CSSProperties | undefined;
  onClickMember: (e: React.MouseEvent, user: MemberWithUser['user']) => void;
}) {
  const canonical = useCanonicalUserView(member.user);
  const { baseName } = parseFederatedUsername(canonical.username);
  const displayName = canonical.displayName ?? baseName;

  return (
    <div
      onClick={(e) => onClickMember(e, canonical)}
      className="flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] mb-1 cursor-pointer transition-colors glass-pill border-l-2 border-l-[rgb(var(--status-online))]"
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
            className={`text-[12.5px] leading-[1.2] font-medium truncate ${colorStyle ? '' : 'text-txt-primary'}`}
            style={colorStyle}
          />
          {canonical.staffRole && <StaffBadge role={canonical.staffRole} />}
          {canonical.netrexEnabled && <NetrexChip />}
        </div>
        {channelName && (
          <div className="flex items-center gap-1 text-[10.5px] leading-[1.3] text-txt-secondary min-w-0">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
              <path d="M19 10v2a7 7 0 01-14 0v-2" />
            </svg>
            <span className="truncate">{channelName}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function ActivityMemberPanel() {
  const { t } = useLanguage();
  const members = useSpaceStore((s) => s.members);
  const spaces = useSpaceStore((s) => s.spaces);
  const currentSpaceId = useSpaceStore((s) => s.currentSpaceId);
  const channels = useSpaceStore((s) => s.channels);
  const loadingSpaceId = useSpaceStore((s) => s.loadingSpaceId);
  const memberListOpen = useUIStore((s) => s.memberListOpen);
  const openUserProfile = useUIStore((s) => s.openUserProfile);
  const openModal = useUIStore((s) => s.openModal);
  const userActivities = useActivityStore((s) => s.userActivities);

  // Live voice state: server-pushed map (all channels) + our own LiveKit
  // room, which is the freshest source for the channel we are connected to.
  const voiceUsersMap = useVoiceStore((s) => s.voiceUsers);
  const currentVoiceChannelId = useVoiceStore((s) => s.currentVoiceChannelId);
  const liveParticipants = useVoiceStore((s) => s.participants);
  const isLiveKitConnected = useVoiceStore((s) => s.isLiveKitConnected);
  const me = useAuthStore((s) => s.user);

  // Netrex feature preferences (Hub-controlled). The panel itself is only
  // rendered when the entitlement is active (see RightPanel), so this store
  // value is a pure layout preference.
  const hubPanelMode = useNetrexPrefsStore((s) => s.memberPanelMode);
  const compactGrid = useNetrexPrefsStore((s) => s.activeFeatures.includes('memberGridCompact'));

  const [mode, setMode] = useState<ActivityMemberMode>(hubPanelMode);

  // Keep the in-panel switcher in sync when the mode is flipped from the
  // Netrex Hub ("Modo actividad" / "Modo estándar") while the panel is open.
  useEffect(() => {
    setMode(hubPanelMode);
  }, [hubPanelMode]);

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

  // Voice channels of the current space (name lookup + which channels count
  // as "in voice" for this panel).
  const spaceVoiceChannels = useMemo(
    () => channels.filter((c: Channel) => c.type === 'voice' && c.spaceId === currentSpaceId),
    [channels, currentSpaceId]
  );
  const spaceVoiceChannelIds = useMemo(
    () => new Set(spaceVoiceChannels.map((c) => c.id)),
    [spaceVoiceChannels]
  );
  const voiceChannelNameById = useMemo(() => {
    const names = new Map<string, string>();
    for (const c of spaceVoiceChannels) names.set(c.id, c.name);
    return names;
  }, [spaceVoiceChannels]);

  // Consolidated userId → voice channel for the current space. Server map is
  // the base; our own connected room overrides it (same precedence as
  // VoiceChannel). The local participant's id can be origin-scoped, so it is
  // resolved back to the member-list id.
  const selfIds = useMemo(
    () => new Set([me?.id, me?.homeUserId].filter((v): v is string => !!v)),
    [me]
  );
  const voiceByUser = useMemo(() => {
    const byUser = new Map<string, string>();
    const put = (userId: string, channelId: string) => {
      if (!byUser.has(userId)) byUser.set(userId, channelId);
    };
    for (const [channelId, userIds] of voiceUsersMap) {
      if (!spaceVoiceChannelIds.has(channelId)) continue;
      for (const uid of userIds) put(uid, channelId);
    }
    if (currentVoiceChannelId && isLiveKitConnected && liveParticipants.length > 0) {
      for (const p of liveParticipants) {
        const uid = selfIds.has(p.userId)
          ? (members.find((m) => selfIds.has(m.userId))?.userId ?? p.userId)
          : p.userId;
        put(uid, currentVoiceChannelId);
      }
    }
    return byUser;
  }, [voiceUsersMap, spaceVoiceChannelIds, currentVoiceChannelId, isLiveKitConnected, liveParticipants, selfIds, members]);

  // Live grouping of online members into the activity sections. Every input
  // (presence, voice map, activities) is reactive, so members move between
  // sections without any refresh.
  const grouped = useMemo(() => {
    const inVoice: MemberWithUser[] = [];
    const playing: MemberWithUser[] = [];
    const listening: MemberWithUser[] = [];
    const rest: MemberWithUser[] = [];
    for (const m of onlineMembers) {
      if (voiceByUser.has(m.userId)) {
        inVoice.push(m);
        continue;
      }
      const primary = getPrimaryActivity(userActivities.get(m.userId) ?? []);
      if (primary?.type === 'playing' || primary?.type === 'streaming') {
        playing.push(m);
      } else if (primary?.type === 'spotify' || primary?.type === 'listening') {
        listening.push(m);
      } else {
        rest.push(m);
      }
    }
    return { inVoice, playing, listening, rest };
  }, [onlineMembers, voiceByUser, userActivities]);

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

  const renderActivityRow = (member: MemberWithUser) => {
    const primary = getPrimaryActivity(userActivities.get(member.userId) ?? []);
    if (!primary) return null;
    return (
      <ActivityMemberRow
        key={member.userId}
        member={member}
        primary={primary}
        accentClass={getActivityAccentClass(primary.type)}
        colorStyle={getMemberColor(member)}
        onClickMember={handleMemberClick}
      />
    );
  };

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
              <div className="space-y-3 pt-1">
                {/* En voz — connected to a voice channel, channel underneath */}
                {grouped.inVoice.length > 0 && (
                  <div key="amp-voice" className="amp-regroup-section">
                    <AmpSectionHeader dotClass="bg-status-online" label={t('netrex_amp_group_in_voice')} count={grouped.inVoice.length} />
                    {grouped.inVoice.map((m) => {
                      const channelId = voiceByUser.get(m.userId);
                      return (
                        <div key={m.userId} className="amp-regroup-item">
                          <VoiceMemberRow
                            member={m}
                            channelName={channelId ? (voiceChannelNameById.get(channelId) ?? null) : null}
                            colorStyle={getMemberColor(m)}
                            onClickMember={handleMemberClick}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Jugando — game activity detected (streaming counts too) */}
                {grouped.playing.length > 0 && (
                  <div key="amp-playing" className="amp-regroup-section">
                    <AmpSectionHeader dotClass="bg-accent-mint" label={t('netrex_amp_group_playing')} count={grouped.playing.length} />
                    {grouped.playing.map((m) => (
                      <div key={m.userId} className="amp-regroup-item">{renderActivityRow(m)}</div>
                    ))}
                  </div>
                )}

                {/* Escuchando — Spotify / music activity */}
                {grouped.listening.length > 0 && (
                  <div key="amp-listening" className="amp-regroup-section">
                    <AmpSectionHeader dotClass="bg-accent-sky" label={t('netrex_amp_group_listening')} count={grouped.listening.length} />
                    {grouped.listening.map((m) => (
                      <div key={m.userId} className="amp-regroup-item">{renderActivityRow(m)}</div>
                    ))}
                  </div>
                )}

                {/* En línea — everyone else */}
                {grouped.rest.length > 0 && (
                  <div key="amp-online" className="amp-regroup-section">
                    <AmpSectionHeader dotClass="bg-status-online" label={t('netrex_amp_group_online')} count={grouped.rest.length} />
                    {/* Netrex "Cuadrícula Compacta de Miembros": render the plain-online
                        members as the dense Discord-style grid when the Hub feature is on. */}
                    {compactGrid ? (
                      <CompactMembersGrid
                        users={grouped.rest.map((m) => m.user)}
                        getActivities={(u) => userActivities.get(u.homeUserId ?? u.id) ?? []}
                        onMemberClick={handleMemberClick}
                        onAddClick={() => openModal('invite')}
                        addTitle={t('netrex_activity_invite')}
                        showActivityFeed={false}
                      />
                    ) : (
                      grouped.rest.map((m) => (
                        <div key={m.userId} className="amp-regroup-item">{renderMember(m)}</div>
                      ))
                    )}
                  </div>
                )}

                {/* Sin conexión */}
                {offlineMembers.length > 0 && (
                  <div key="amp-offline" className="amp-regroup-section">
                    <h3 className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-txt-tertiary px-1 mb-1">
                      {t('netrex_amp_group_offline')} — {offlineMembers.length}
                    </h3>
                    {offlineMembers.map((m) => (
                      <div key={m.userId} className="amp-regroup-item">{renderMember(m, true)}</div>
                    ))}
                  </div>
                )}

                {grouped.inVoice.length === 0 && grouped.playing.length === 0 && grouped.listening.length === 0 && grouped.rest.length === 0 && offlineMembers.length === 0 && (
                  <p className="text-[10.5px] text-txt-tertiary px-1 py-2">{t('netrex_amp_empty')}</p>
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
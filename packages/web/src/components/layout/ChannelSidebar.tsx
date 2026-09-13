import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { Channel } from '@backspace/shared';
import { useSpaceStore, getChannelOrigin, getMyUserIdForOrigin, type TaggedSpace } from '../../stores/spaceStore';
import { useChatStore } from '../../stores/chatStore';
import { useUIStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import { useInstanceStore } from '../../stores/instanceStore';
import { VoiceChannel } from '../voice/VoiceChannel';
import { VoiceControls } from '../voice/VoiceControls';
import { useVoiceStore } from '../../stores/voiceStore';
import { ProfileAvatar } from '../ui/ProfileAvatar';
import { Mascot } from '../ui/Mascot';
import { getSpaceGradient } from '../../utils/gradients';
import { wsSend } from '../../hooks/useWebSocket';
import { AudioManager } from '../../audio/AudioManager';
import { hasPermissionBit, PermissionBits } from '../../utils/permissions';
import { joinVoiceChannel, broadcastVoiceStatus, broadcastDeafenViaLiveKit } from '../../utils/voice';
import { useContextMenuStore, type ContextMenuItem } from '../../stores/contextMenuStore';
import { usePresenceMenuItems } from './PresenceMenu';
import { NetrexNavChip } from './NetrexNavChip';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { DmSearchBar } from './DmSearchBar';
import { DmListItem } from './DmListItem';
import { useDragManager, type DropTarget, type LayoutItem } from '../../hooks/useDragManager';
import { useDelayedLoading } from '../../hooks/useDelayedLoading';
import { useSocialStore } from '../../stores/socialStore';
import { buildUserContextMenuItems } from '../../utils/userContextMenu';
import { pointAnchor } from '../../hooks/useFloatingPosition';
import { isSelf } from '../../utils/identity';
import { useAudioDevices } from '../../hooks/useAudioDevices';
import { DropdownItem } from '../modals/settingsPanels/_shared/SettingsPickerPrimitives';
import { useLanguage } from '../../contexts/LanguageContext';
import { Tooltip } from '../ui/Tooltip';

export function ChannelSidebar() {
  const spaces = useSpaceStore((s) => s.spaces);
  const currentSpaceId = useSpaceStore((s) => s.currentSpaceId);
  const loadingSpaceId = useSpaceStore((s) => s.loadingSpaceId);
  const channels = useSpaceStore((s) => s.channels);
  const dmChannels = useSpaceStore((s) => s.dmChannels);
  const currentChannelId = useChatStore((s) => s.currentChannelId);
  const setCurrentChannel = useChatStore((s) => s.setCurrentChannel);
  const unreadChannels = useChatStore((s) => s.unreadChannels);
  const openModal = useUIStore((s) => s.openModal);
  const openUserProfile = useUIStore((s) => s.openUserProfile);
  const user = useAuthStore((s) => s.user);
  const friends = useSocialStore((s) => s.friends);
  const friendRequests = useSocialStore((s) => s.requests);
  const currentVoiceChannelId = useVoiceStore((s) => s.currentVoiceChannelId);
  const isMuted = useVoiceStore((s) => s.isMuted);
  const isDeafened = useVoiceStore((s) => s.isDeafened);
  const toggleMic = useVoiceStore((s) => s.toggleMic);
  const toggleDeafen = useVoiceStore((s) => s.toggleDeafen);
  const spaceId = useSpaceStore((s) => currentVoiceChannelId ? s.channelToSpaceMap.get(currentVoiceChannelId) : null);
  const myOriginId = useSpaceStore((s) => currentVoiceChannelId ? getMyUserIdForOrigin(getChannelOrigin(currentVoiceChannelId)) : s.members.find(m => m.userId === user?.id)?.userId ?? user?.id);
  const spaceMutedUserIds = useVoiceStore((s) => s.spaceMutedUserIds);
  const spaceDeafenedUserIds = useVoiceStore((s) => s.spaceDeafenedUserIds);
  const permissionMutedUserIds = useVoiceStore((s) => s.permissionMutedUserIds);

  const isSpaceMuted = !!(myOriginId && spaceId && spaceMutedUserIds.has(`${spaceId}:${myOriginId}`));
  const isSpaceDeafened = !!(myOriginId && spaceId && spaceDeafenedUserIds.has(`${spaceId}:${myOriginId}`));
  const isPermissionMuted = !!(myOriginId && spaceId && permissionMutedUserIds.has(`${spaceId}:${myOriginId}`));
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const isVertexPage = location.pathname === '/vertex';
  const isNetrexPage = location.pathname === '/netrex';

  const [floatingPanelEl, setFloatingPanelEl] = useState<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const floatingPanelHeight = useUIStore((s) => s.floatingPanelHeight);
  const setFloatingPanelHeight = useUIStore((s) => s.setFloatingPanelHeight);

  useEffect(() => {
    if (!floatingPanelEl) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setFloatingPanelHeight(entry.contentRect.height);
    });
    ro.observe(floatingPanelEl);
    return () => ro.disconnect();
  }, [floatingPanelEl, setFloatingPanelHeight]);

  const handleMicToggle = async () => {
    if (isSpaceMuted || isSpaceDeafened || isPermissionMuted) return;
    const wasDeafened = useVoiceStore.getState().isDeafened;
    toggleMic();
    broadcastVoiceStatus();
    // If unmuting while deafened cleared deafen, broadcast via LiveKit data channel
    if (wasDeafened && !useVoiceStore.getState().isDeafened) {
      broadcastDeafenViaLiveKit();
    }
  };

  const handleDeafenToggle = async () => {
    if (isSpaceDeafened) return;
    toggleDeafen();
    broadcastVoiceStatus();
    broadcastDeafenViaLiveKit();
  };

  const spacePermissions = useSpaceStore((s) => s.spacePermissions);
  const space = spaces.find(s => s.id === currentSpaceId);
  const mySpacePerms = currentSpaceId ? spacePermissions.get(currentSpaceId) : undefined;
  const isLoadingSpace = !!loadingSpaceId && loadingSpaceId === currentSpaceId;
  const showChannelSkeleton = useDelayedLoading(isLoadingSpace);

  const federationInstances = useInstanceStore((s) => s.instances);
  const instanceLabel = useMemo(() => {
    const origin = (space as any)?._instanceOrigin;
    if (!origin) return null;
    const inst = federationInstances.find(i => i.origin === origin);
    if (inst) return inst.label;
    try { return new URL(origin).host; } catch { return origin; }
  }, [space, federationInstances]);
  const channelPermissions = useSpaceStore((s) => s.channelPermissions);
  const canManageChannels = hasPermissionBit(mySpacePerms, PermissionBits.MANAGE_CHANNELS);
  const canManageRoles = hasPermissionBit(mySpacePerms, PermissionBits.MANAGE_ROLES);
  const canCreateInvite = hasPermissionBit(mySpacePerms, PermissionBits.CREATE_INVITE);
  const categories = useSpaceStore((s) => s.categories);

  // Delete category confirmation state
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);
  const [deleteCategoryLoading, setDeleteCategoryLoading] = useState(false);
  const [leaveGroupDmId, setLeaveGroupDmId] = useState<string | null>(null);
  const [leaveGroupDmLoading, setLeaveGroupDmLoading] = useState(false);

  // Centralized context menu
  const openContextMenu = useContextMenuStore((s) => s.open);

  // Collapse state — persisted in localStorage
  const collapseKey = `backspace:collapsed-categories:${currentSpaceId}`;
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(collapseKey);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const toggleCollapse = useCallback((categoryId: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      try { localStorage.setItem(collapseKey, JSON.stringify([...next])); } catch {}
      return next;
    });
  }, [collapseKey]);

  // Filter channels by VIEW_CHANNEL (defense-in-depth — server already filters,
  // but this catches transient races where channels and permissions are briefly out of sync)
  const visibleChannels = useMemo(() =>
    channels.filter(ch => hasPermissionBit(channelPermissions.get(ch.id), PermissionBits.VIEW_CHANNEL)),
    [channels, channelPermissions]);

  // Group channels by category
  const sortedCategories = useMemo(() =>
    [...categories].sort((a, b) => a.position - b.position), [categories]);
  const uncategorizedChannels = useMemo(() =>
    visibleChannels.filter(c => !c.categoryId).sort((a, b) => a.position - b.position), [visibleChannels]);
  const channelsByCategory = useMemo(() => {
    const map = new Map<string, typeof channels>();
    for (const ch of visibleChannels) {
      if (!ch.categoryId) continue;
      let arr = map.get(ch.categoryId);
      if (!arr) { arr = []; map.set(ch.categoryId, arr); }
      arr.push(ch);
    }
    for (const [key, arr] of map) {
      map.set(key, arr.sort((a, b) => a.position - b.position));
    }
    return map;
  }, [visibleChannels]);

  // Partition a group of channels into text rows then voice rows.
  // This is the canonical visual order the sidebar renders in (and `orderedItems`
  // mirrors), so drag-and-drop position math stays aligned with what you see.
  const partitionChannels = useCallback((list: Channel[]): { text: Channel[]; voice: Channel[] } => {
    const text = list.filter(c => c.type !== 'voice').sort((a, b) => a.position - b.position);
    const voice = list.filter(c => c.type === 'voice').sort((a, b) => a.position - b.position);
    return { text, voice };
  }, []);

  // Check if a collapsed category has unread channels
  const categoryHasUnread = useCallback((categoryId: string) => {
    const chs = channelsByCategory.get(categoryId) ?? [];
    return chs.some(ch => unreadChannels.has(ch.id));
  }, [channelsByCategory, unreadChannels]);

  // --- Centralized drag-and-drop ---

  // Flat ordered list matching visual sidebar order — used by useDragManager
  // to normalize 'before B' into 'after A' for a single drop indicator line.
  // Mirrors the rendered order: within each group, text rows come before voice rows.
  const orderedItems = useMemo<LayoutItem[]>(() => {
    const items: LayoutItem[] = [];
    const pushGroup = (list: Channel[]) => {
      const { text, voice } = partitionChannels(list);
      for (const ch of text) items.push({ id: ch.id, type: 'channel' });
      for (const ch of voice) items.push({ id: ch.id, type: 'channel' });
    };
    pushGroup(uncategorizedChannels);
    for (const cat of sortedCategories) {
      items.push({ id: cat.id, type: 'category' });
      if (!collapsedCategories.has(cat.id)) {
        pushGroup(channelsByCategory.get(cat.id) ?? []);
      }
    }
    return items;
  }, [partitionChannels, uncategorizedChannels, sortedCategories, channelsByCategory, collapsedCategories]);

  const canMoveMembers = hasPermissionBit(mySpacePerms, PermissionBits.MOVE_MEMBERS);

  const handleChannelDrop = useCallback((dragId: string, target: DropTarget) => {
    if (!currentSpaceId) return;

    const allChannelsCopy = channels.map(ch => ({
      id: ch.id,
      position: ch.position,
      categoryId: ch.categoryId,
    }));

    if (target.targetType === 'channel') {
      const targetCh = channels.find(c => c.id === target.targetId);
      if (targetCh) {
        const dragCh = allChannelsCopy.find(c => c.id === dragId);
        if (dragCh) dragCh.categoryId = targetCh.categoryId;
      }
    } else if (target.targetType === 'category') {
      const dragCh = allChannelsCopy.find(c => c.id === dragId);
      if (dragCh) dragCh.categoryId = target.targetId;
    }

    const grouped = new Map<string | null, typeof allChannelsCopy>();
    for (const ch of allChannelsCopy) {
      let arr = grouped.get(ch.categoryId);
      if (!arr) { arr = []; grouped.set(ch.categoryId, arr); }
      arr.push(ch);
    }

    for (const [, arr] of grouped) {
      arr.sort((a, b) => a.position - b.position);
      const dragIdx = arr.findIndex(c => c.id === dragId);
      if (dragIdx === -1) continue;
      const dragItem = arr[dragIdx]!;
      arr.splice(dragIdx, 1);

      if (target.targetType === 'channel') {
        const targetIdx = arr.findIndex(c => c.id === target.targetId);
        if (targetIdx !== -1) {
          const insertIdx = target.position === 'before' ? targetIdx : targetIdx + 1;
          arr.splice(insertIdx, 0, dragItem);
        } else {
          arr.push(dragItem);
        }
      } else {
        arr.unshift(dragItem);
      }
      arr.forEach((ch, i) => { ch.position = i; });
    }

    const channelUpdates = allChannelsCopy.map(ch => ({
      id: ch.id,
      position: ch.position,
      categoryId: ch.categoryId,
    }));
    const categoryUpdates = sortedCategories.map(c => ({
      id: c.id,
      position: c.position,
    }));

    useSpaceStore.getState().setChannels(
      channels.map(ch => {
        const update = channelUpdates.find(u => u.id === ch.id);
        if (update) return { ...ch, position: update.position, categoryId: update.categoryId };
        return ch;
      }).sort((a, b) => a.position - b.position)
    );
    useSpaceStore.getState().updateChannelLayout(currentSpaceId, { channels: channelUpdates, categories: categoryUpdates });
  }, [channels, sortedCategories, currentSpaceId]);

  const handleCategoryDrop = useCallback((dragId: string, target: DropTarget) => {
    if (!currentSpaceId) return;

    const catsCopy = sortedCategories.map(c => ({ id: c.id, position: c.position }));
    const dragIdx = catsCopy.findIndex(c => c.id === dragId);
    if (dragIdx === -1) return;

    const dragItem = catsCopy[dragIdx]!;
    catsCopy.splice(dragIdx, 1);
    const targetIdx = catsCopy.findIndex(c => c.id === target.targetId);
    if (targetIdx !== -1) {
      const insertIdx = target.position === 'before' ? targetIdx : targetIdx + 1;
      catsCopy.splice(insertIdx, 0, dragItem);
    } else {
      catsCopy.push(dragItem);
    }
    catsCopy.forEach((c, i) => { c.position = i; });

    const channelUpdates = channels.map(ch => ({
      id: ch.id,
      position: ch.position,
      categoryId: ch.categoryId,
    }));

    useSpaceStore.getState().setCategories(
      categories.map(cat => {
        const update = catsCopy.find(u => u.id === cat.id);
        if (update) return { ...cat, position: update.position };
        return cat;
      }).sort((a, b) => a.position - b.position)
    );
    useSpaceStore.getState().updateChannelLayout(currentSpaceId, { channels: channelUpdates, categories: catsCopy });
  }, [sortedCategories, categories, channels, currentSpaceId]);

  const handleVoiceUserDrop = useCallback((userId: string, fromChannelId: string, toChannelId: string) => {
    const voiceOrigin = getChannelOrigin(fromChannelId);
    wsSend({ type: 'voice_move', userId, targetChannelId: toChannelId }, voiceOrigin);
  }, []);

  const {
    activeDrag, dropTarget,
    channelHandlers, categoryHandlers,
    voiceUserHandlers, voiceChannelDropZone,
    containerHandlers,
  } = useDragManager({
    scrollContainerRef,
    canManage: canManageChannels,
    canMoveMembers,
    orderedItems,
    onChannelDrop: handleChannelDrop,
    onCategoryDrop: handleCategoryDrop,
    onVoiceUserDrop: handleVoiceUserDrop,
  });

  const spaceMenuItems = useMemo(() => {
    const items: ContextMenuItem[] = [];
    if (canManageChannels) {
      items.push({
        key: 'create-channel',
        type: 'action',
        label: 'Create Channel',
        icon: (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2.5 12.5v-9l5-2v9l-5 2zm6-9v9l5-2v-9l-5 2z" opacity="0.5" />
            <path d="M5.72 12.885l.18-.085V3.2L2.1 4.9v8.5l3.62-1.515zM7.1 3.2v9.6l3.8-1.6V2.7L7.1 3.2z" />
          </svg>
        ),
        onClick: () => openModal('createChannel'),
      });
      items.push({
        key: 'create-category',
        type: 'action',
        label: 'Create Category',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
          </svg>
        ),
        onClick: () => openModal('createCategory'),
      });
    }
    if (canCreateInvite) {
      items.push({
        key: 'invite',
        type: 'action',
        label: 'Invite People',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 3H24V5H21V8H19V5H16V3H19V0H21V3ZM10 12C12.21 12 14 10.21 14 8C14 5.79 12.21 4 10 4C7.79 4 6 5.79 6 8C6 10.21 7.79 12 10 12ZM10 13C6.69 13 1 14.66 1 18V20H19V18C19 14.66 13.31 13 10 13Z" />
          </svg>
        ),
        onClick: () => openModal('invite'),
      });
    }
    items.push({
      key: 'settings',
      type: 'action',
      label: 'Space Settings',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z" />
        </svg>
      ),
      onClick: () => openModal('spaceSettings'),
    });
    return items;
  }, [canManageChannels, canCreateInvite, openModal]);

  // Right-click anywhere in the space sidebar — same space actions.
  const handleSidebarContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openContextMenu({ x: e.clientX, y: e.clientY }, spaceMenuItems);
  }, [openContextMenu, spaceMenuItems]);

  // "⋯" button in the space identity module — opens the same space actions.
  const handleSpaceMenuButton = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    openContextMenu({ x: e.clientX, y: e.clientY }, spaceMenuItems);
  }, [openContextMenu, spaceMenuItems]);

  const handleDmContextMenu = useCallback((e: React.MouseEvent, dmId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const dm = dmChannels.find((d) => d.id === dmId);
    const other = dm && !dm.ownerId ? dm.members.find((m) => !isSelf(m, user)) : undefined;

    const items: ContextMenuItem[] = [];

    if (other) {
      items.push(...buildUserContextMenuItems({
        user: other,
        me: user,
        friends,
        requests: friendRequests,
        t,
        onViewProfile: (u) => openUserProfile(u, pointAnchor(e.clientX, e.clientY)),
        onCloseDm: () => {
          if (currentChannelId === dmId) {
            navigate('/channels/@me');
            setCurrentChannel(null);
          }
          useSpaceStore.getState().closeDm(dmId);
        },
        onAddFriend: () => { useSocialStore.getState().sendFriendRequest(other.username).catch(() => {}); },
        onRemoveFriend: () => { useSocialStore.getState().removeFriend(other.id).catch(() => {}); },
        onCancelRequest: () => {
          const s = useSocialStore.getState();
          const req = s.requests.find((r) => r.user && (r.user.homeUserId ?? r.user.id) === (other.homeUserId ?? other.id));
          if (req) s.cancelFriendRequest(req.id).catch(() => {});
        },
        onAcceptRequest: () => {
          const s = useSocialStore.getState();
          const req = s.requests.find((r) => r.user && (r.user.homeUserId ?? r.user.id) === (other.homeUserId ?? other.id));
          if (req) s.updateFriendRequest(req.id, 'accepted').catch(() => {});
        },
        onDeclineRequest: () => {
          const s = useSocialStore.getState();
          const req = s.requests.find((r) => r.user && (r.user.homeUserId ?? r.user.id) === (other.homeUserId ?? other.id));
          if (req) s.updateFriendRequest(req.id, 'declined').catch(() => {});
        },
      }));
    }

    // Group DMs: keep the existing Leave Group entry.
    if (dm?.ownerId) {
      items.push({ key: 'group-sep', type: 'separator' });
      items.push({
        key: 'leave-group',
        type: 'action',
        label: t('leave_group'),
        danger: true,
        onClick: () => setLeaveGroupDmId(dmId),
      });
    }

    if (items.length === 0) return;
    openContextMenu({ x: e.clientX, y: e.clientY }, items);
  }, [openContextMenu, dmChannels, user, friends, friendRequests, t, openUserProfile, currentChannelId, navigate, setCurrentChannel]);

  const handleChannelClick = (channelId: string) => {
    setCurrentChannel(channelId);
    navigate(`/channels/${currentSpaceId || '@me'}/${channelId}`);
  };

  const handleHomeClick = () => {
    setCurrentChannel(null);
    navigate('/channels/@me');
  };

  const handleVoiceJoin = (channelId: string) => {
    // Don't re-join the same channel — prevents duplicate LiveKit connections
    if (currentVoiceChannelId === channelId) {
      navigate(`/channels/${currentSpaceId}/${channelId}`);
      return;
    }
    const connectFn = useVoiceStore.getState().connectFn;
    joinVoiceChannel(channelId, connectFn ?? undefined);
    navigate(`/channels/${currentSpaceId}/${channelId}`);
  };

  const inVoiceSession = currentVoiceChannelId;

  // Floating voice bubble — only present while connected to a channel/call.
  // The user area lives INSIDE the sidebar column now; this stays glass because
  // it is a persistent transient control (voice controls) floating above content.
  const voiceBubble = user && inVoiceSession ? (
    <div ref={setFloatingPanelEl} data-pip-obstacle="bottom" className="fixed bottom-0 left-0 right-0 z-[105] p-2 md:right-auto md:w-[232px] md:bottom-[4px] md:left-[100px] md:p-0">
      <div className="glass-bubble rounded-[16px] shadow-[0_8px_28px_rgba(0,0,0,0.28)]">
        <VoiceControls />
      </div>
    </div>
  ) : null;

  if (!space) {
    return (
      <>
<div data-sidebar-column className="w-60 md:w-full bg-surface-channel flex flex-col flex-shrink-0 select-none md:pl-[96px] md:border-r md:border-white/[0.04] ">
        {/* Search module — primary navigation tool */}
        <div className="px-2.5 pt-2.5 z-10">
          <DmSearchBar />

          {/* Primary navigation */}
          <div className="mt-1 flex flex-col p-0.5">
            <div
              onClick={handleHomeClick}
              className={`flex items-center gap-2 px-2 h-[34px] rounded-[8px] cursor-pointer transition-colors group ${
                !currentChannelId && location.pathname !== '/explore' && !isVertexPage && !isNetrexPage
                  ? 'bg-white/[0.05] text-txt-primary'
                  : 'text-txt-tertiary hover:bg-white/[0.03] hover:text-txt-secondary'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className={`flex-shrink-0 ${!currentChannelId ? 'text-accent-primary' : 'opacity-70 group-hover:opacity-100'}`}>
                <path d="M13 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-2-4a2 2 0 1 1 4 0 2 2 0 0 1-4 0Z" />
                <path d="M3 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-1c0-2.76-5.37-4-8-4s-8 1.24-8 4v1Z" />
                <path d="M3.5 13.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" opacity=".5" />
              </svg>
              <span className="font-medium text-[14px]">{t('friends')}</span>
            </div>

            {/* VERTEX — product section entry */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => navigate('/vertex')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate('/vertex');
                }
              }}
              aria-label="VERTEX"
              data-fx="vertex"
              className={`group flex items-center gap-2 px-2 h-[40px] rounded-[8px] cursor-pointer select-none transition-all ${
                isVertexPage
                  ? 'bg-white/[0.07] ring-1 ring-white/[0.07]'
                  : 'hover:bg-white/[0.035]'
              }`}
            >
              <div
                className={`w-[28px] h-[28px] rounded-[8px] flex-shrink-0 flex items-center justify-center border transition-all duration-200 ${
                  isVertexPage
                    ? 'bg-accent-primary/10 border-accent-primary/25 shadow-[0_0_0_3px_rgb(var(--accent-primary-glow)/0.08)]'
                    : 'bg-white/[0.04] border-white/[0.07] group-hover:bg-white/[0.06] group-hover:border-white/[0.12]'
                }`}
              >
                <span className={`text-[13px] font-black leading-none tracking-[-0.03em] transition-colors ${isVertexPage ? 'text-accent-primary' : 'text-txt-primary'}`}>V</span>
              </div>
              <div className="min-w-0 flex-1 flex flex-col justify-center leading-none">
                <span className={`text-[13px] font-bold tracking-[0.08em] transition-colors ${isVertexPage ? 'text-txt-primary' : 'text-txt-secondary group-hover:text-txt-primary'}`}>
                  VERTEX
                </span>
              </div>
              {isVertexPage && (
                <span className="w-[6px] h-[6px] rounded-full bg-accent-primary flex-shrink-0" />
              )}
            </div>

            {/* NETREX — premium section entry */}
            <NetrexNavChip
              isCurrentPage={isNetrexPage}
            />
          </div>
        </div>

        {/* Division between header and list */}
        <div className="mx-2.5 mt-2 border-b border-white/[0.04]" />

        {/* Direct messages */}
        <div className="flex-1 overflow-y-auto pt-2.5 px-2 no-scrollbar" style={{ paddingBottom: 12 }}>
          <div className="px-1.5 mb-1.5 flex items-center justify-between group">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-txt-tertiary/60">
              {t('direct_messages')}
              <span className="ml-1.5 text-txt-tertiary/40 font-semibold normal-case tracking-normal">{dmChannels.length}</span>
            </span>
            <button
              onClick={() => openModal('newDm')}
              className="opacity-0 group-hover:opacity-100 text-txt-tertiary/70 hover:text-txt-primary w-6 h-6 flex items-center justify-center rounded-[6px] hover:bg-white/[0.05] transition-all"
              title={t('new_direct_message')}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 2a.5.5 0 01.5.5v5h5a.5.5 0 010 1h-5v5a.5.5 0 01-1 0v-5h-5a.5.5 0 010-1h5v-5A.5.5 0 018 2z" />
              </svg>
            </button>
          </div>

          <div className="space-y-[3px]">
            {dmChannels.map((dm) => (
              <DmListItem
                key={dm.id}
                dm={dm}
                isActive={currentChannelId === dm.id}
                isUnread={unreadChannels.has(dm.id) && currentChannelId !== dm.id}
                user={user!}
                onSelect={handleChannelClick}
                onClose={(id) => {
                  if (currentChannelId === id) {
                    navigate('/channels/@me');
                    setCurrentChannel(null);
                  }
                  useSpaceStore.getState().closeDm(id);
                }}
                onLeave={(id) => setLeaveGroupDmId(id)}
                onContextMenu={handleDmContextMenu}
              />
            ))}
            {dmChannels.length === 0 && (
              <div className="flex flex-col items-center py-6 opacity-80">
                <Mascot state="sleeping" className="w-20 h-20 mb-2" />
                <p className="text-[13px] text-txt-tertiary">{t('no_conversations')}</p>
              </div>
            )}
          </div>
        </div>

        {/* User module — in-layout bottom profile */}
        {user && (
<div className="px-2 mt-auto" style={{ paddingBottom: inVoiceSession ? floatingPanelHeight + 4 : 12 }}>
          <div className="rounded-[12px] border border-white/[0.05] bg-white/[0.03] overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_2px_14px_-10px_rgba(0,0,0,0.6)]">
            <UserAreaPanel
              user={user}
              isMuted={isMuted}
              isDeafened={isDeafened}
              isSpaceMuted={isSpaceMuted}
              isSpaceDeafened={isSpaceDeafened}
              isPermissionMuted={isPermissionMuted}
              onMicToggle={handleMicToggle}
              onDeafenToggle={handleDeafenToggle}
              onSettingsClick={(tab) => openModal('userSettings', tab ? { tab } : {})}
            />
          </div>
        </div>
        )}
      </div>
      {voiceBubble}
      <ConfirmDialog
        isOpen={leaveGroupDmId !== null}
        onClose={() => setLeaveGroupDmId(null)}
        onConfirm={async () => {
          if (!leaveGroupDmId) return;
          setLeaveGroupDmLoading(true);
          try {
            if (currentChannelId === leaveGroupDmId) {
              navigate('/channels/@me');
              setCurrentChannel(null);
            }
            await useSpaceStore.getState().leaveDm(leaveGroupDmId);
            setLeaveGroupDmId(null);
          } catch {
            // leaveDm already handles errors
          } finally {
            setLeaveGroupDmLoading(false);
          }
        }}
        title="Leave Group DM"
        description="Are you sure you want to leave? You won't be able to rejoin unless someone adds you back."
        confirmLabel="Leave"
        variant="danger"
        loading={leaveGroupDmLoading}
      />
      </>
    );
  }

  return (
    <>
    <div data-sidebar-column className="w-60 md:w-full bg-surface-channel flex flex-col flex-shrink-0 select-none md:pl-[96px] md:border-r md:border-white/[0.04] ">
      {/* Server banner — full sidebar width, directly above the identity header.
          Rendered only when the space has one: no banner → no reserved space.
          GIFs animate naturally in the <img>; no CSS animation is layered on
          top (reduced-motion safe). Sits below the floating space rail
          (z-[100], left-3 + 72px wide) thanks to the sidebar's md:pl-[96px]. */}
      {(space as TaggedSpace)?.banner && (() => {
        const b = (space as TaggedSpace).banner!;
        const bannerSrc = b.startsWith('http') || b.startsWith('/') ? b : `/api/uploads/${b}`;
        return (
          <button
            type="button"
            onClick={() => openModal('spaceSettings')}
            className="relative block w-full h-[96px] overflow-hidden bg-surface-base focus:outline-none group/banner"
            aria-label={space.name}
          >
            <img
              src={bannerSrc}
              alt=""
              draggable={false}
              className="w-full h-full object-cover"
            />
            {/* Bottom hairline melts the banner into the identity module below */}
            <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-surface-channel to-transparent pointer-events-none" />
          </button>
        );
      })()}
      {/* Space identity module — application context header */}
      <div className="px-2.5 pt-2.5 pb-2 z-10">
        <div className="rounded-[14px] border border-white/[0.06] bg-gradient-to-br from-white/[0.05] to-white/[0.02] overflow-hidden shadow-[0_4px_20px_-8px_rgba(0,0,0,0.55)]">
          <div className="flex items-stretch">
            <button
              onClick={() => openModal('spaceSettings')}
              className="flex items-center gap-2.5 min-w-0 flex-1 p-2 text-left transition-colors hover:bg-white/[0.03]"
            >
              <Tooltip content={space.name} position="bottom" delay={350}>
                <div
                  className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center shadow-[0_2px_12px_rgba(0,0,0,0.35)] ring-2 ring-white/[0.08] transition-shadow duration-150 hover:ring-accent-primary/70"
                  style={space.icon ? undefined : { background: getSpaceGradient(space.id, space.name, space.avatarColor).gradient }}
                >
                  {space.icon ? (
                    <img
                      src={space.icon.startsWith('http') || space.icon.startsWith('/') ? space.icon : `/api/uploads/${space.icon}`}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[15px] font-bold text-white">{space.name.charAt(0).toUpperCase()}</span>
                  )}
                </div>
              </Tooltip>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-[16px] tracking-[-0.02em] text-txt-primary truncate leading-snug">
                  {space.name}
                </div>
                <div className="text-[11px] text-txt-tertiary font-medium truncate leading-snug opacity-90">
                  {instanceLabel ?? window.location.host}
                </div>
              </div>
            </button>
            <button
              onClick={handleSpaceMenuButton}
              className="w-10 flex-shrink-0 flex items-center justify-center text-txt-tertiary/70 hover:text-txt-primary hover:bg-white/[0.04] transition-colors"
              title="Space actions — settings, invite, create"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 10a2 2 0 110 4 2 2 0 010-4zm6 0a2 2 0 110 4 2 2 0 010-4zm6 0a2 2 0 110 4 2 2 0 010-4z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Division between identity and channel modules */}
      <div className="mx-2.5 border-b border-white/[0.05]" />

      {/* Channels — grouped module layouts */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pt-2 px-2 no-scrollbar" style={{ paddingBottom: 12 }} onDrop={containerHandlers.onDrop} onDragOver={containerHandlers.onDragOver} onContextMenu={handleSidebarContextMenu}>
        {/* Editorial section label */}
        <div className="px-1 mb-2 flex items-center justify-between">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.22em] text-txt-tertiary/55">
            {t('channels')}
            {canManageChannels && sortedCategories.length > 0 && (
              <span className="ml-1.5 px-1.5 py-px rounded-full bg-white/[0.04] border border-white/[0.05] text-[8.5px] font-bold normal-case tracking-normal text-txt-tertiary/80">{visibleChannels.length}</span>
            )}
          </span>
          {canManageChannels && canManageRoles && (
            <button
              onClick={() => openModal('bulkPermissions')}
              className="flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-[0.14em] text-txt-tertiary/70 hover:text-txt-primary transition-colors px-1.5 py-0.5 rounded-md hover:bg-white/[0.05]"
              title="Bulk channel permissions"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
              {t('permissions')}
            </button>
          )}
          {canManageChannels && sortedCategories.length === 0 && (
            <button
              onClick={() => openModal('createChannel')}
              className="text-txt-tertiary/60 hover:text-txt-primary transition-colors"
              title="Create Channel"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 2a.5.5 0 01.5.5v5h5a.5.5 0 010 1h-5v5a.5.5 0 01-1 0v-5h-5a.5.5 0 010-1h5v-5A.5.5 0 018 2z" />
              </svg>
            </button>
          )}
        </div>
        {showChannelSkeleton ? (
          <div className="flex flex-col gap-3" role="status" aria-label="Loading channels">
            {/* Group panel skeleton 1 */}
            <div className="rounded-[12px] border border-white/[0.04] bg-white/[0.025] p-2">
              <div className="skeleton skeleton-bar h-2 w-[45%] ml-1 mb-3" />
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 mb-1" style={{ animationDelay: `${i * 0.1}s` }}>
                  <div className="skeleton w-3.5 h-3.5 rounded-sm flex-shrink-0" style={{ animationDelay: `${i * 0.1}s` }} />
                  <div className="skeleton skeleton-bar flex-1" style={{ width: `${55 + (i * 17) % 25}%`, animationDelay: `${i * 0.1}s` }} />
                </div>
              ))}
            </div>
            {/* Group panel skeleton 2 */}
            <div className="rounded-[12px] border border-white/[0.04] bg-white/[0.025] p-2">
              <div className="skeleton skeleton-bar h-2 w-[55%] ml-1 mb-3" style={{ animationDelay: '0.3s' }} />
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 mb-1" style={{ animationDelay: `${(i + 3) * 0.1}s` }}>
                  <div className="skeleton w-3.5 h-3.5 rounded-sm flex-shrink-0" style={{ animationDelay: `${(i + 3) * 0.1}s` }} />
                  <div className="skeleton skeleton-bar flex-1" style={{ width: `${50 + (i * 13) % 30}%`, animationDelay: `${(i + 3) * 0.1}s` }} />
                </div>
              ))}
            </div>
          </div>
        ) : (<>
        {/* Uncategorized channels — grouped panel */}
        {(() => {
          const { text, voice } = partitionChannels(uncategorizedChannels);
          if (text.length + voice.length === 0) return null;
          return (
            <div className="mb-3">
              <div className="rounded-[12px] border border-white/[0.04] bg-white/[0.025] overflow-hidden p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.02),0_2px_14px_-10px_rgba(0,0,0,0.6)]">
                <div className="space-y-px">
                  {text.map((channel) => (
                    <ChannelItem
                      key={channel.id}
                      channel={channel}
                      isActive={currentChannelId === channel.id}
                      isUnread={unreadChannels.has(channel.id) && currentChannelId !== channel.id}
                      canManage={canManageChannels}
                      isDragging={activeDrag?.type === 'channel' && activeDrag.dragId === channel.id}
                      dropIndicator={dropTarget?.targetId === channel.id ? dropTarget.position : null}
                      onChannelClick={channel.type === 'voice' ? (() => {
                        const chPerms = channelPermissions.get(channel.id);
                        const canConnect = hasPermissionBit(chPerms, PermissionBits.CONNECT);
                        if (canConnect) handleVoiceJoin(channel.id);
                      }) : (() => handleChannelClick(channel.id))}
                      onSettingsClick={() => openModal('channelSettings', { channelId: channel.id })}
                      channelDragHandlers={channelHandlers(channel.id)}
                      voiceUserHandlers={voiceUserHandlers}
                      voiceChannelDropZone={voiceChannelDropZone(channel.id)}
                      channelPermissions={channelPermissions}
                      handleVoiceJoin={handleVoiceJoin}
                    />
                  ))}
                  {voice.length > 0 && (
                    <div className="flex items-center gap-2 px-1.5 pt-1.5 pb-0.5">
                      <span className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-txt-tertiary/45">{t('voice')}</span>
                      <div className="flex-1 h-px bg-white/[0.05]" />
                    </div>
                  )}
                  {voice.map((channel) => (
                    <ChannelItem
                      key={channel.id}
                      channel={channel}
                      isActive={currentChannelId === channel.id}
                      isUnread={unreadChannels.has(channel.id) && currentChannelId !== channel.id}
                      canManage={canManageChannels}
                      isDragging={activeDrag?.type === 'channel' && activeDrag.dragId === channel.id}
                      dropIndicator={dropTarget?.targetId === channel.id ? dropTarget.position : null}
                      onChannelClick={channel.type === 'voice' ? (() => {
                        const chPerms = channelPermissions.get(channel.id);
                        const canConnect = hasPermissionBit(chPerms, PermissionBits.CONNECT);
                        if (canConnect) handleVoiceJoin(channel.id);
                      }) : (() => handleChannelClick(channel.id))}
                      onSettingsClick={() => openModal('channelSettings', { channelId: channel.id })}
                      channelDragHandlers={channelHandlers(channel.id)}
                      voiceUserHandlers={voiceUserHandlers}
                      voiceChannelDropZone={voiceChannelDropZone(channel.id)}
                      channelPermissions={channelPermissions}
                      handleVoiceJoin={handleVoiceJoin}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Categories — grouped panel per category */}
        {sortedCategories.map((category) => {
          const catChannels = channelsByCategory.get(category.id) ?? [];

          // Hide empty categories for users without MANAGE_CHANNELS permission
          if (!canManageChannels && catChannels.length === 0) return null;

          const { text, voice } = partitionChannels(catChannels);
          const isCollapsed = collapsedCategories.has(category.id);
          const hasUnread = isCollapsed && categoryHasUnread(category.id);

          const categoryHeader = (
                <div
                  className={`flex items-center justify-between px-2.5 pt-1.5 pb-1 group cursor-pointer relative ${
                    activeDrag?.type === 'category' && activeDrag.dragId === category.id ? 'opacity-50' : ''
                  } ${dropTarget?.targetId === category.id && dropTarget.targetType === 'category' ? 'ring-1 ring-accent-mint/20 rounded' : ''}`}
                  {...categoryHandlers(category.id)}
                  onClick={() => toggleCollapse(category.id)}
                >
                  <div className="flex items-center gap-1 text-txt-tertiary hover:text-txt-secondary transition-colors min-w-0">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className={`opacity-50 transition-transform flex-shrink-0 ${isCollapsed ? '-rotate-90' : ''}`}>
                      <path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z" />
                    </svg>
                    <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] truncate text-txt-tertiary/90">{category.name}</span>
                    {!isCollapsed && (
                      <span className="text-[9.5px] font-semibold text-txt-tertiary/40 tracking-normal normal-case">{catChannels.length}</span>
                    )}
                    {category.isPrivate && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="text-txt-muted flex-shrink-0">
                        <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                      </svg>
                    )}
                    {hasUnread && (
                      <div className="ml-1 w-1.5 h-1.5 rounded-full bg-accent-rose/40 flex-shrink-0" />
                    )}
                  </div>
                  {canManageChannels && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openModal('createChannel', { categoryId: category.id });
                      }}
                      className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded-[6px] text-txt-tertiary hover:text-accent-mint hover:bg-white/[0.05] transition-all flex-shrink-0"
                      title="Create Channel"
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 2a.5.5 0 01.5.5v5h5a.5.5 0 010 1h-5v5a.5.5 0 01-1 0v-5h-5a.5.5 0 010-1h5v-5A.5.5 0 018 2z" />
                      </svg>
                    </button>
                  )}
                </div>
          );

          return (
            <div key={category.id} className="mb-3">
              <div className="rounded-[12px] border border-white/[0.04] bg-white/[0.025] overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.02),0_2px_14px_-10px_rgba(0,0,0,0.6)]">
                {/* Category header */}
                {canManageChannels ? (
                  <div onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openContextMenu({ x: e.clientX, y: e.clientY }, [
                      {
                        key: 'category-settings',
                        type: 'action',
                        label: 'Category Settings',
                        icon: (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.611 3.611 0 0112 15.6z" />
                          </svg>
                        ),
                        onClick: () => openModal('categorySettings', { categoryId: category.id }),
                      },
                      {
                        key: 'delete-category',
                        type: 'action',
                        label: 'Delete Category',
                        danger: true,
                        icon: (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                          </svg>
                        ),
                        onClick: () => setDeleteCategoryId(category.id),
                      },
                    ]);
                  }}>
                    {categoryHeader}
                  </div>
                ) : categoryHeader}

                {/* Category channels (hidden when collapsed) */}
                {!isCollapsed && (
                  <div className="p-1 pt-0.5">
                    <div className="space-y-px">
                      {text.map((channel) => (
                        <ChannelItem
                          key={channel.id}
                          channel={channel}
                          isActive={currentChannelId === channel.id}
                          isUnread={unreadChannels.has(channel.id) && currentChannelId !== channel.id}
                          canManage={canManageChannels}
                          isDragging={activeDrag?.type === 'channel' && activeDrag.dragId === channel.id}
                          dropIndicator={dropTarget?.targetId === channel.id ? dropTarget.position : null}
                          onChannelClick={channel.type === 'voice' ? (() => {
                            const chPerms = channelPermissions.get(channel.id);
                            const canConnect = hasPermissionBit(chPerms, PermissionBits.CONNECT);
                            if (canConnect) handleVoiceJoin(channel.id);
                          }) : (() => handleChannelClick(channel.id))}
                          onSettingsClick={() => openModal('channelSettings', { channelId: channel.id })}
                          channelDragHandlers={channelHandlers(channel.id)}
                          voiceUserHandlers={voiceUserHandlers}
                          voiceChannelDropZone={voiceChannelDropZone(channel.id)}
                          channelPermissions={channelPermissions}
                          handleVoiceJoin={handleVoiceJoin}
                        />
                      ))}
                      {voice.length > 0 && (
                        <div className="flex items-center gap-2 px-1.5 pt-1.5 pb-0.5">
                          <span className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-txt-tertiary/45">{t('voice')}</span>
                          <div className="flex-1 h-px bg-white/[0.05]" />
                        </div>
                      )}
                      {voice.map((channel) => (
                        <ChannelItem
                          key={channel.id}
                          channel={channel}
                          isActive={currentChannelId === channel.id}
                          isUnread={unreadChannels.has(channel.id) && currentChannelId !== channel.id}
                          canManage={canManageChannels}
                          isDragging={activeDrag?.type === 'channel' && activeDrag.dragId === channel.id}
                          dropIndicator={dropTarget?.targetId === channel.id ? dropTarget.position : null}
                          onChannelClick={channel.type === 'voice' ? (() => {
                            const chPerms = channelPermissions.get(channel.id);
                            const canConnect = hasPermissionBit(chPerms, PermissionBits.CONNECT);
                            if (canConnect) handleVoiceJoin(channel.id);
                          }) : (() => handleChannelClick(channel.id))}
                          onSettingsClick={() => openModal('channelSettings', { channelId: channel.id })}
                          channelDragHandlers={channelHandlers(channel.id)}
                          voiceUserHandlers={voiceUserHandlers}
                          voiceChannelDropZone={voiceChannelDropZone(channel.id)}
                          channelPermissions={channelPermissions}
                          handleVoiceJoin={handleVoiceJoin}
                        />
                      ))}
                      {catChannels.length === 0 && (
                        <div className="px-2 py-2 text-[12px] text-txt-tertiary italic opacity-40">No channels</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Create channel / category buttons */}
        {canManageChannels && (
          <div className="px-1 mt-5">
            {sortedCategories.length > 0 && (
              <button
                onClick={() => openModal('createChannel')}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[8px] text-[12.5px] text-txt-tertiary/70 hover:text-txt-secondary hover:bg-white/[0.03] transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="flex-shrink-0 opacity-60">
                  <path d="M8 2a.5.5 0 01.5.5v5h5a.5.5 0 010 1h-5v5a.5.5 0 01-1 0v-5h-5a.5.5 0 010-1h5v-5A.5.5 0 018 2z" />
                </svg>
                <span>Create Channel</span>
              </button>
            )}
            <button
              onClick={() => openModal('createCategory')}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[8px] text-[12.5px] text-txt-tertiary/70 hover:text-txt-secondary hover:bg-white/[0.03] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="flex-shrink-0 opacity-60">
                <path d="M8 2a.5.5 0 01.5.5v5h5a.5.5 0 010 1h-5v5a.5.5 0 01-1 0v-5h-5a.5.5 0 010-1h5v-5A.5.5 0 018 2z" />
              </svg>
              <span>Create Category</span>
            </button>
          </div>
        )}
        </>)}

      </div>

      {/* User module — in-layout bottom profile */}
      {user && (
        <div className="px-2 mt-auto" style={{ paddingBottom: inVoiceSession ? floatingPanelHeight + 4 : 12 }}>
          <div className="rounded-[12px] border border-white/[0.05] bg-white/[0.03] overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_2px_14px_-10px_rgba(0,0,0,0.6)]">
            <UserAreaPanel
              user={user}
              isMuted={isMuted}
              isDeafened={isDeafened}
              isSpaceMuted={isSpaceMuted}
              isSpaceDeafened={isSpaceDeafened}
              isPermissionMuted={isPermissionMuted}
              onMicToggle={handleMicToggle}
              onDeafenToggle={handleDeafenToggle}
              onSettingsClick={(tab) => openModal('userSettings', tab ? { tab } : {})}
            />
          </div>
        </div>
      )}
    </div>
    {voiceBubble}
    <ConfirmDialog
      isOpen={deleteCategoryId !== null}
      onClose={() => setDeleteCategoryId(null)}
      onConfirm={async () => {
        if (!deleteCategoryId) return;
        setDeleteCategoryLoading(true);
        try {
          await useSpaceStore.getState().deleteCategory(deleteCategoryId);
          setDeleteCategoryId(null);
        } catch {
          // deleteCategory already shows a toast on error
        } finally {
          setDeleteCategoryLoading(false);
        }
      }}
      title="Delete Category"
      description="Are you sure you want to delete this category? Channels in this category will be moved to uncategorized — no channels will be deleted."
      confirmLabel="Delete"
      variant="danger"
      loading={deleteCategoryLoading}
    />
    </>
  );
}

/* ─── User Area Panel ──────────────────────────────────────────────────────── */

function UserAreaPanel({
  user,
  isMuted,
  isDeafened,
  isSpaceMuted,
  isSpaceDeafened,
  isPermissionMuted,
  onMicToggle,
  onDeafenToggle,
  onSettingsClick,
}: {
  user: any;
  isMuted: boolean;
  isDeafened: boolean;
  isSpaceMuted: boolean;
  isSpaceDeafened: boolean;
  isPermissionMuted: boolean;
  onMicToggle: () => void;
  onDeafenToggle: () => void;
  onSettingsClick: (tab?: string) => void;
}) {
  const [openPanel, setOpenPanel] = useState<'input' | 'output' | null>(null);
  const openContextMenu = useContextMenuStore((s) => s.open);
  const presenceMenuItems = usePresenceMenuItems(user);
  const inputDeviceId = useVoiceStore((s) => s.inputDeviceId);
  const outputDeviceId = useVoiceStore((s) => s.outputDeviceId);
  const setInputDevice = useVoiceStore((s) => s.setInputDevice);
  const setOutputDevice = useVoiceStore((s) => s.setOutputDevice);

  // Shared hook drives lists, permission state, and live devicechange refresh.
  const { permState, inputs: inputDevices, outputs: outputDevices, inputLabels, outputLabels, requestPermission } = useAudioDevices();

  const selectedInputLabel = inputDeviceId === 'default'
    ? 'System Default'
    : inputLabels.get(inputDeviceId) ?? 'System Default';
  const selectedOutputLabel = outputDeviceId === 'default'
    ? 'System Default'
    : outputLabels.get(outputDeviceId) ?? 'System Default';

  const inputVolume = useVoiceStore((s) => s.inputVolume);
  const storeSetInputVolume = useVoiceStore((s) => s.setInputVolume);
  const outputVolume = useVoiceStore((s) => s.outputVolume);
  const storeSetOutputVolume = useVoiceStore((s) => s.setOutputVolume);
  const [showInputDeviceList, setShowInputDeviceList] = useState(false);
  const [showOutputDeviceList, setShowOutputDeviceList] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);

  // Start mic level monitoring when input panel opens
  useEffect(() => {
    if (openPanel !== 'input') {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      analyserRef.current = null;
      setMicLevel(0);
      return;
    }

    const start = async () => {
      try {
        await AudioManager.getInstance().resumeContext();
        const analyser = AudioManager.getInstance().getAnalyserNode();
        analyser.fftSize = 256;
        analyserRef.current = analyser;
        
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(data);
          const avg = data.reduce((a, b) => a + b, 0) / data.length;
          setMicLevel(Math.min(avg / 128, 1));
          animFrameRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch { /* no mic access */ }
    };
    start();
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      analyserRef.current = null;
    };
  }, [openPanel]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpenPanel(null);
        setShowInputDeviceList(false);
        setShowOutputDeviceList(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const togglePanel = (panel: 'input' | 'output') => {
    if (openPanel === panel) {
      setOpenPanel(null);
    } else {
      setOpenPanel(panel);
      setShowInputDeviceList(false);
      setShowOutputDeviceList(false);
      // Resume the AudioContext so the mic-level meter starts measuring on open.
      AudioManager.getInstance().resumeContext();
    }
  };

  const selectInput = (deviceId: string) => {
    setInputDevice(deviceId); // Pure state update → triggers syncMic if in voice call
    AudioManager.getInstance().setInputDevice(deviceId).catch(() => {});
    setShowInputDeviceList(false);
  };

  const selectOutput = (deviceId: string) => {
    setOutputDevice(deviceId);
    AudioManager.getInstance().setOutputDevice(deviceId).catch(() => {});
    setShowOutputDeviceList(false);
  };

  // Generate mic level bars (20 bars like Discord)
  const micBars = 20;
  const activeBars = Math.round(micLevel * micBars * (inputVolume / 100));

  return (
    <div className="relative" ref={panelRef}>
      {/* Input settings panel */}
      {openPanel === 'input' && (
        <div className="absolute bottom-full left-0 right-0 mb-0 bg-surface-channel rounded-t-lg shadow-lg z-[150] border-t border-x border-border-hard">
          {/* Input Device */}
          <div className="relative">
            <button
              onClick={() => setShowInputDeviceList(!showInputDeviceList)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-interactive-hover transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-txt-primary text-left">Input Device</div>
                <div className="text-[13px] text-txt-tertiary truncate text-left">{selectedInputLabel}</div>
              </div>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-txt-tertiary flex-shrink-0 ml-2">
                <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
              </svg>
            </button>
            {showInputDeviceList && (
              <div className="bg-surface-base rounded-lg shadow-lg mx-2 mb-2 py-1 border border-border-hard max-h-64 overflow-y-auto">
                {permState !== 'granted' && (
                  <div className="px-3 py-2 text-[12px] text-txt-tertiary">
                    Microphone permission needed.{' '}
                    <button
                      onClick={() => { requestPermission().catch(() => {}); }}
                      className="underline text-accent-primary"
                    >
                      Enable
                    </button>
                  </div>
                )}
                {permState === 'granted' && (
                  <>
                    <DropdownItem
                      label="System Default"
                      active={inputDeviceId === 'default'}
                      onClick={() => selectInput('default')}
                    />
                    {inputDevices.filter(d => d.deviceId !== 'default').map(d => (
                      <DropdownItem
                        key={d.deviceId}
                        label={inputLabels.get(d.deviceId) ?? d.deviceId}
                        active={inputDeviceId === d.deviceId}
                        onClick={() => selectInput(d.deviceId)}
                      />
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="mx-4 border-t border-border-soft" />

                      {/* Input Volume */}
                      <div className="px-4 py-3">
                        <div className="text-[15px] font-semibold text-txt-primary mb-2">Input Volume</div>
                        <input
                          type="range"
                          min={0}
                          max={200}
                          value={inputVolume}
                          onChange={(e) => {
                            const vol = Number(e.target.value);
                            storeSetInputVolume(vol);
                          }}
                          className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-accent-primary bg-surface-base [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md"
                          style={{
                            background: `linear-gradient(to right, rgb(var(--accent-primary)) 0%, rgb(var(--accent-primary)) ${inputVolume / 2}%, rgb(var(--interactive-muted)) ${inputVolume / 2}%, rgb(var(--interactive-muted)) 100%)`,
                          }}
                        />
                        {/* Mic level meter */}
                        <div className="flex items-center gap-[3px] mt-2.5">
                          {Array.from({ length: micBars }).map((_, i) => (
                            <div
                              key={i}
                              className={`flex-1 h-[6px] rounded-[1px] transition-colors duration-75 ${
                                i < activeBars ? 'bg-txt-tertiary' : 'bg-interactive-muted'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
          
                      <div className="mx-4 border-t border-border-soft" />
          
                      {/* Voice Settings link */}
                      <button
                        onClick={() => onSettingsClick('voice')}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-interactive-hover transition-colors"
                      >
                        <span className="text-[15px] font-semibold text-txt-primary">Voice Settings</span>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-txt-tertiary">
                          <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                        </svg>
                      </button>
                    </div>
                  )}
          
                  {/* Output settings panel */}
                  {openPanel === 'output' && (
                    <div className="absolute bottom-full left-0 right-0 mb-0 bg-surface-channel rounded-t-lg shadow-lg z-[150] border-t border-x border-border-hard">
                      {/* Output Device */}
                      <div className="relative">
                        <button
                          onClick={() => setShowOutputDeviceList(!showOutputDeviceList)}
                          className="w-full px-4 py-3 flex items-center justify-between hover:bg-interactive-hover transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-[15px] font-semibold text-txt-primary text-left">Output Device</div>
                            <div className="text-[13px] text-txt-tertiary truncate text-left">{selectedOutputLabel}</div>
                          </div>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-txt-tertiary flex-shrink-0 ml-2">
                            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                          </svg>
                        </button>
                        {showOutputDeviceList && (
                          <div className="bg-surface-base rounded-lg shadow-lg mx-2 mb-2 py-1 border border-border-hard max-h-64 overflow-y-auto">
                            {permState !== 'granted' && (
                              <div className="px-3 py-2 text-[12px] text-txt-tertiary">
                                Audio permission needed.{' '}
                                <button
                                  onClick={() => { requestPermission().catch(() => {}); }}
                                  className="underline text-accent-primary"
                                >
                                  Enable
                                </button>
                              </div>
                            )}
                            {permState === 'granted' && (
                              <>
                                <DropdownItem
                                  label="System Default"
                                  active={outputDeviceId === 'default'}
                                  onClick={() => selectOutput('default')}
                                />
                                {outputDevices.filter(d => d.deviceId !== 'default').map(d => (
                                  <DropdownItem
                                    key={d.deviceId}
                                    label={outputLabels.get(d.deviceId) ?? d.deviceId}
                                    active={outputDeviceId === d.deviceId}
                                    onClick={() => selectOutput(d.deviceId)}
                                  />
                                ))}
                              </>
                            )}
                          </div>
                        )}
                      </div>
          
                      <div className="mx-4 border-t border-border-soft" />
          
                      {/* Output Volume */}
                      <div className="px-4 py-3">
                        <div className="text-[15px] font-semibold text-txt-primary mb-2">Output Volume</div>
                        <input
                          type="range"
                          min={0}
                          max={200}
                          value={outputVolume}
                          onChange={(e) => {
                            const vol = Number(e.target.value);
                            storeSetOutputVolume(vol);
                          }}
                          className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-surface-base [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md"
                          style={{
                            background: `linear-gradient(to right, rgb(var(--accent-primary)) 0%, rgb(var(--accent-primary)) ${outputVolume / 2}%, rgb(var(--interactive-muted)) ${outputVolume / 2}%, rgb(var(--interactive-muted)) 100%)`,
                          }}
                        />
                      </div>
          <div className="mx-4 border-t border-border-soft" />

          {/* Voice Settings link */}
          <button
            onClick={() => onSettingsClick('voice')}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-interactive-hover transition-colors"
          >
            <span className="text-[15px] font-semibold text-txt-primary">Voice Settings</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-txt-tertiary">
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
            </svg>
          </button>
        </div>
      )}

      {/* User area module — user first, controls recede until hover */}
      <div className="flex flex-col p-1.5 select-none group/user">
        {/* Profile — primary element. Click opens the presence menu
            (status switcher); Settings stays available in the controls row. */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            openContextMenu(
              { x: rect.left, y: rect.top - 8 },
              [
                ...presenceMenuItems,
                { type: 'separator' as const, key: 'presence-sep' },
                {
                  type: 'action' as const,
                  key: 'user-area-settings',
                  label: 'Settings',
                  onClick: () => onSettingsClick(),
                },
              ],
            );
          }}
          className="px-1.5 py-1.5 rounded-[9px] flex items-center gap-2.5 min-w-0 w-full cursor-pointer transition-colors group hover:bg-white/[0.03]"
        >
          <ProfileAvatar src={user.avatar} name={user.displayName ?? user.username} size={32} status={user.status} user={user} />
          <div className="min-w-0 flex-1 text-left">
            <div className="text-[13.5px] font-semibold text-txt-primary truncate leading-tight">{user.displayName ?? user.username}</div>
            <div className="text-[11px] text-txt-tertiary truncate leading-tight opacity-80">@{user.username}</div>
          </div>
          <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center text-txt-tertiary/60 opacity-0 group-hover:opacity-100 transition-opacity">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 10l5 5 5-5H7z" />
            </svg>
          </div>
        </button>

        {/* Controls — compact, muted until the module is hovered */}
        <div className="flex items-center gap-0.5 px-1 opacity-0 group-hover/user:opacity-100 transition-opacity">
          {/* Mic */}
          <button
            onClick={onMicToggle}
            className={`w-6 h-6 flex items-center justify-center hover:bg-white/[0.08] rounded-[7px] transition-colors ${
              (isSpaceMuted || isSpaceDeafened || isPermissionMuted) ? 'text-accent-amber cursor-not-allowed'
                : isMuted || isDeafened ? 'text-txt-danger' : 'text-txt-tertiary/70 hover:text-txt-primary'
            }`}
            title={(isPermissionMuted) ? 'Muted (No Speak Permission)' : (isSpaceMuted || isSpaceDeafened) ? 'Space Muted' : isMuted ? 'Unmute' : 'Mute'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              {(isMuted || isDeafened || isSpaceMuted || isSpaceDeafened || isPermissionMuted) && <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />}
            </svg>
          </button>
          {/* Input chevron */}
          <button
            onClick={() => togglePanel('input')}
            className={`w-5 h-6 flex items-center justify-center hover:bg-white/[0.08] rounded-[7px] transition-colors ${
              openPanel === 'input' ? 'text-txt-primary bg-white/[0.08]' : 'text-txt-tertiary/70 hover:text-txt-primary'
            }`}
            title="Input Devices"
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" className={`transition-transform ${openPanel === 'input' ? 'rotate-180' : ''}`}>
              <path d="M7 10l5 5 5-5z" />
            </svg>
          </button>

          {/* Headphones */}
          <button
            onClick={onDeafenToggle}
            className={`w-6 h-6 flex items-center justify-center hover:bg-white/[0.08] rounded-[7px] transition-colors ${
              isSpaceDeafened ? 'text-accent-amber cursor-not-allowed'
                : isDeafened ? 'text-txt-danger' : 'text-txt-tertiary/70 hover:text-txt-primary'
            }`}
            title={isSpaceDeafened ? 'Space Deafened' : isDeafened ? 'Undeafen' : 'Deafen'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3c-4.97 0-9 4.03-9 9v7c0 1.1.9 2 2 2h2v-7H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-2v7h2c1.1 0 2-.9 2-2v-7c0-4.97-4.03-9-9-9z" />
              {(isDeafened || isSpaceDeafened) && <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />}
            </svg>
          </button>
          {/* Output chevron */}
          <button
            onClick={() => togglePanel('output')}
            className={`w-5 h-6 flex items-center justify-center hover:bg-white/[0.08] rounded-[7px] transition-colors ${
              openPanel === 'output' ? 'text-txt-primary bg-white/[0.08]' : 'text-txt-tertiary/70 hover:text-txt-primary'
            }`}
            title="Output Devices"
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" className={`transition-transform ${openPanel === 'output' ? 'rotate-180' : ''}`}>
              <path d="M7 10l5 5 5-5z" />
            </svg>
          </button>

          <div className="flex-1" />

          {/* Settings */}
          <button
            onClick={() => onSettingsClick()}
            className="w-6 h-6 flex items-center justify-center text-txt-tertiary/70 hover:text-txt-primary hover:bg-white/[0.08] rounded-[7px] transition-colors"
            title="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Channel Item (unified text + voice) ──────────────────────────────────── */

function ChannelItem({
  channel,
  isActive,
  isUnread,
  canManage,
  isDragging,
  dropIndicator,
  onChannelClick,
  onSettingsClick,
  channelDragHandlers,
  voiceUserHandlers,
  voiceChannelDropZone,
  channelPermissions,
  handleVoiceJoin,
}: {
  channel: Channel;
  isActive: boolean;
  isUnread: boolean;
  canManage: boolean;
  isDragging: boolean;
  dropIndicator: 'before' | 'after' | null;
  onChannelClick: () => void;
  onSettingsClick: () => void;
  channelDragHandlers: {
    draggable: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  voiceUserHandlers: (userId: string, channelId: string) => {
    draggable: boolean;
    isBeingDragged: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: (e: React.DragEvent) => void;
  };
  voiceChannelDropZone: {
    onDragOver: (e: React.DragEvent) => void;
    onDragEnter: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    isDragOver: boolean;
    isValidTarget: boolean;
  };
  channelPermissions: Map<string, string>;
  handleVoiceJoin: (channelId: string) => void;
}) {
  if (channel.type === 'voice') {
    const chPerms = channelPermissions.get(channel.id);
    const canConnect = hasPermissionBit(chPerms, PermissionBits.CONNECT);
    return (
      <div
        className={`relative ${isDragging ? 'opacity-50' : ''}`}
        {...channelDragHandlers}
      >
        {dropIndicator === 'before' && <div className="absolute -top-[1px] left-2 right-2 h-[2px] bg-accent-mint rounded-full z-10" />}
        <VoiceChannel
          channelId={channel.id}
          channelName={channel.name}
          onClick={() => canConnect && handleVoiceJoin(channel.id)}
          locked={!canConnect}
          canManage={canManage}
          onSettingsClick={onSettingsClick}
          voiceUserHandlers={voiceUserHandlers}
          dropZone={voiceChannelDropZone}
        />
        {dropIndicator === 'after' && <div className="absolute -bottom-[1px] left-2 right-2 h-[2px] bg-accent-mint rounded-full z-10" />}
      </div>
    );
  }

  return (
    <div
      className={`relative ${isDragging ? 'opacity-50' : ''}`}
      {...channelDragHandlers}
    >
      {dropIndicator === 'before' && <div className="absolute -top-[1px] left-2 right-2 h-[2px] bg-accent-mint rounded-full z-10" />}
      <button
        onClick={onChannelClick}
        className={`relative w-full flex items-center gap-2 px-2.5 h-[32px] rounded-[7px] group transition-colors ${
          isActive
            ? 'bg-white/[0.07] text-txt-primary ring-1 ring-white/[0.06]'
            : isUnread
              ? 'text-txt-primary font-semibold hover:bg-white/[0.04]'
              : 'text-txt-tertiary hover:text-txt-secondary hover:bg-white/[0.04]'
        }`}
      >
        {isUnread && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-accent-rose/80" />
        )}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className={`flex-shrink-0 transition-colors ${isActive ? 'text-accent-mint/90' : 'text-txt-tertiary opacity-70 group-hover:opacity-100'}`}>
          <path d="M5.88657 21C5.57547 21 5.3399 20.7189 5.39427 20.4126L6.00001 17H2.59511C2.28449 17 2.04905 16.7198 2.10259 16.4138L2.27759 15.4138C2.31946 15.1746 2.52722 15 2.77011 15H6.35001L7.41001 9H4.00511C3.69449 9 3.45905 8.71977 3.51259 8.41381L3.68759 7.41381C3.72946 7.17456 3.93722 7 4.18011 7H7.76001L8.39677 3.41262C8.43914 3.17391 8.64664 3 8.88907 3H9.87344C10.1845 3 10.4201 3.28107 10.3657 3.58738L9.76001 7H15.76L16.3968 3.41262C16.4391 3.17391 16.6466 3 16.8891 3H17.8734C18.1845 3 18.4201 3.28107 18.3657 3.58738L17.76 7H21.1649C21.4755 7 21.711 7.28023 21.6574 7.58619L21.4824 8.58619C21.4406 8.82544 21.2328 9 20.9899 9H17.41L16.35 15H19.7549C20.0655 15 20.301 15.2802 20.2474 15.5862L20.0724 16.5862C20.0306 16.8254 19.8228 17 19.5799 17H16L15.3632 20.5874C15.3209 20.8261 15.1134 21 14.8709 21H13.8866C13.5755 21 13.3399 20.7189 13.3943 20.4126L14 17H8.00001L7.36325 20.5874C7.32088 20.8261 7.11337 21 6.87094 21H5.88657ZM9.41001 9L8.35001 15H14.35L15.41 9H9.41001Z" />
        </svg>
        <span className={`truncate text-[13.5px] tracking-[-0.005em] leading-[18px] flex-1 text-left ${isUnread ? 'font-semibold' : 'font-medium'}`}>{channel.name}</span>
        {canManage && (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-txt-tertiary hover:text-txt-primary transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onSettingsClick();
            }}
          >
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
          </svg>
        )}
      </button>
      {dropIndicator === 'after' && <div className="absolute -bottom-[1px] left-2 right-2 h-[2px] bg-accent-mint rounded-full z-10" />}
    </div>
  );
}

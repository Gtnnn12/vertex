import React from 'react';
import { MemberSidebar } from './MemberSidebar';
import { ActivityPanel } from './ActivityPanel';
import { DmRosterPanel } from './DmRosterPanel';
import { ActivityMemberPanel } from './ActivityMemberPanel';
import { useUIStore } from '../../stores/uiStore';
import { useSpaceStore } from '../../stores/spaceStore';
import { useChatStore } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import { useNetrexFeatureActive } from '../../stores/netrexPrefsStore';

export function RightPanel() {
  const showDms = useUIStore((s) => s.showDms);
  const memberListOpen = useUIStore((s) => s.memberListOpen);
  const currentSpaceId = useSpaceStore((s) => s.currentSpaceId);
  const dmChannels = useSpaceStore((s) => s.dmChannels);
  const currentChannelId = useChatStore((s) => s.currentChannelId);
  const isNetrex = useAuthStore((s) => s.user?.netrexEnabled ?? false);
  // Premium panel requires BOTH the backend entitlement and the user having
  // the feature activated in the Netrex Hub.
  const activityPanelActive = useNetrexFeatureActive('activityMemberPanel');

  // In the DM view (showDms or no current space), the right column is normally
  // the activity panel. The exception is group DMs while the user has the
  // member list toggled on — then we swap in DmRosterPanel, which itself
  // returns null if any of its preconditions are unmet.
  if (showDms || !currentSpaceId) {
    const dmChannel = dmChannels.find((dm) => dm.id === currentChannelId);
    const isGroupDm = !!dmChannel?.ownerId;
    if (isGroupDm && memberListOpen) {
      return <DmRosterPanel />;
    }
    return <ActivityPanel />;
  }

  // Netrex owners get the Activity Member Panel (premium evolution of the
  // member list) once they activate it in the Netrex Hub. Standard accounts
  // keep the classic role-grouped sidebar.
  if (isNetrex && activityPanelActive) {
    return <ActivityMemberPanel />;
  }

  return <MemberSidebar />;
}

import type { DmChannel, MessageWithUser, SpaceInviteSystemPayload, User } from '@backspace/shared';
import { SpaceInviteCard } from './SpaceInviteCard';
import { useLanguage } from '../../contexts/LanguageContext';

interface SystemMessageProps {
  message: MessageWithUser;
  /**
   * The enclosing DM channel, if the message belongs to one. Used to resolve
   * the actor's display name from the channel roster (`dm.members`) for events
   * that don't carry it in the payload (e.g. `name_changed`, `icon_changed`,
   * `owner_changed`). When omitted (e.g. server channels), the renderer falls
   * back to the embedded `message.user`.
   */
  dm?: Pick<DmChannel, 'members'> | null;
}

function resolveActorName(message: MessageWithUser, dm?: Pick<DmChannel, 'members'> | null): string {
  if (dm) {
    const fromRoster = dm.members.find(m => m.id === message.userId) as User | undefined;
    if (fromRoster) {
      return fromRoster.displayName ?? fromRoster.username ?? 'Unknown';
    }
    return 'Unknown';
  }
  return message.user?.displayName ?? message.user?.username ?? 'Someone';
}

/**
 * Inline timeline renderer for system DM messages. Mirrors the sidebar's
 * `formatSystemPreview` semantics but with icons + a slightly fuller phrasing
 * (e.g. surfacing the new name in `name_changed`).
 *
 * Exported so unit tests can render it directly without mounting MessageList.
 */
export function SystemMessage({ message, dm }: SystemMessageProps) {
  const { t } = useLanguage();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(message.content ?? '{}'); } catch { /* fall through to default branch */ }

  const actorName = resolveActorName(message, dm);

  if (data.event === 'space_invite') {
    return (
      <div className="px-4 py-1">
        <SpaceInviteCard payload={data as unknown as SpaceInviteSystemPayload} senderName={actorName} />
      </div>
    );
  }

  // Inline-text events.
  let text = '';
  let icon = '';
  switch (data.event) {
    case 'member_added':
      icon = '→'; // →
      text = t('added_to_group')
        .replace('{actor}', actorName)
        .replace('{target}', String(data.targetDisplayName ?? ''));
      break;
    case 'member_removed':
      if (data.reason === 'leave') {
        icon = '←'; // ←
        text = t('left_the_group').replace('{target}', String(data.targetDisplayName ?? ''));
      } else {
        icon = '←';
        text = t('removed_target_from_group')
          .replace('{actor}', actorName)
          .replace('{target}', String(data.targetDisplayName ?? ''));
      }
      break;
    case 'owner_changed':
      icon = '♛'; // ♛
      text = t('new_group_owner').replace('{name}', String(data.newOwnerDisplayName ?? ''));
      break;
    case 'name_changed':
      icon = '✎'; // ✎
      // newName === null is a meaningful "cleared" state — distinct from a
      // missing field — so we test for a non-empty string explicitly.
      text = typeof data.newName === 'string' && data.newName.length > 0
        ? t('renamed_group_to')
            .replace('{actor}', actorName)
            .replace('{name}', data.newName)
        : t('cleared_group_name').replace('{actor}', actorName);
      break;
    case 'icon_changed':
      icon = '\u{1F5BC}'; // 🖼
      text = t('updated_group_icon').replace('{actor}', actorName);
      break;
    default:
      text = message.content ?? '';
  }

  return (
    <div className="flex items-center justify-center py-1 px-4 select-none">
      <span className="text-xs text-txt-tertiary">
        <span className="mr-1.5">{icon}</span>
        {text}
      </span>
    </div>
  );
}

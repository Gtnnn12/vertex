import React, { useMemo } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import { useLanguage } from '../../contexts/LanguageContext';
import { useDmPreferencesStore } from '../../stores/dmPreferencesStore';
import { formatTypingIndicator } from '../../utils/typingIndicator';

interface TypingIndicatorProps {
  channelId: string;
}

const ANIMATION_CLASS: Record<string, string> = {
  fade: 'animate-typing-in',
  pulse: 'animate-typing-pulse',
  dots: '',
  none: '',
};

export function TypingIndicator({ channelId }: TypingIndicatorProps) {
  const { t } = useLanguage();
  const typingUsersRaw = useChatStore((s) => s.typingUsers.get(channelId));
  const currentUserId = useAuthStore((s) => s.user?.id);
  const isNetrex = useAuthStore((s) => s.user?.netrexEnabled ?? false);

  // Personalization preferences (persisted per-user, local only).
  const typingMode = useDmPreferencesStore((s) => s.typingMode);
  const typingCustomText = useDmPreferencesStore((s) => s.typingCustomText);
  const typingEmoji = useDmPreferencesStore((s) => s.typingEmoji);
  const typingAnimation = useDmPreferencesStore((s) => s.typingAnimation);

  // Filter out current user and expired entries
  const others = useMemo(() => {
    if (!typingUsersRaw || typingUsersRaw.length === 0) return [];
    const now = Date.now();
    return typingUsersRaw
      .filter(t => now - t.timestamp < 5000 && t.userId !== currentUserId);
  }, [typingUsersRaw, currentUserId]);

  const rendered = useMemo(
    () =>
      formatTypingIndicator({
        mode: typingMode,
        customText: typingCustomText,
        emoji: typingEmoji,
        animation: typingAnimation,
        isNetrex,
        typingNames: others.map((o) => o.username),
        defaultTemplate: t('is_typing_template'),
        defaultTemplateTwo: t('are_typing_two'),
        defaultTemplateMany: t('several_people_are_typing'),
      }),
    [typingMode, typingCustomText, typingEmoji, typingAnimation, isNetrex, others, t]
  );

  if (others.length === 0) return null;
  if (rendered.text === '' && rendered.emoji === '') return null;

  const wrapperAnim = ANIMATION_CLASS[rendered.animation] ?? '';
  const showDots =
    rendered.animation === 'dots' &&
    (rendered.text !== '' || rendered.emoji !== '');

  return (
    <div
      className={`absolute bottom-full left-1 md:left-4 mb-1 px-3 flex items-center text-[12px] text-txt-secondary font-medium select-none pointer-events-none ${wrapperAnim} motion-reduce:animate-none`}
    >
      <div className="flex items-center gap-2">
        {showDots && (
          <div className="flex gap-[2px] bg-surface-elevated/20 rounded-full px-2 py-1">
            <div className="w-[5px] h-[5px] bg-txt-message rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '0.8s' }} />
            <div className="w-[5px] h-[5px] bg-txt-message rounded-full animate-bounce" style={{ animationDelay: '150ms', animationDuration: '0.8s' }} />
            <div className="w-[5px] h-[5px] bg-txt-message rounded-full animate-bounce" style={{ animationDelay: '300ms', animationDuration: '0.8s' }} />
          </div>
        )}
        {rendered.emoji && (
          <span className="text-[14px] leading-none">{rendered.emoji}</span>
        )}
        {rendered.text && (
          <span className="truncate max-w-[400px]">
            <span className="font-bold">{rendered.text}</span>
          </span>
        )}
      </div>
    </div>
  );
}

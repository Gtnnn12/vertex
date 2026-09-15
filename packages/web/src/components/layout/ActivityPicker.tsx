import React, { useState } from 'react';
import type { ActivityType } from '@vertex/shared';
import { useManualActivityStore } from '../../activity';
import { useLanguage } from '../../contexts/LanguageContext';

/**
 * Activity picker widget for the presence menu (ContextMenuCustom).
 * Four activity kinds + free text; sets the user's manual activity via
 * ManualActivityProvider, which pushes it over WS to all connected clients.
 */

const KINDS: Array<{ type: ActivityType; labelKey: string; emoji: string }> = [
  { type: 'playing', labelKey: 'compact_grid_verb_playing', emoji: '🎮' },
  { type: 'listening', labelKey: 'compact_grid_verb_listening', emoji: '🎧' },
  { type: 'watching', labelKey: 'compact_grid_verb_watching', emoji: '📺' },
  { type: 'custom', labelKey: 'activity_custom', emoji: '💬' },
];

export function ActivityPicker(): React.ReactNode {
  const { t } = useLanguage();
  const selection = useManualActivityStore((s) => s.selection);
  const setManualActivity = useManualActivityStore((s) => s.setManualActivity);
  const clearManualActivity = useManualActivityStore((s) => s.clearManualActivity);

  const [kind, setKind] = useState<ActivityType>(selection?.type ?? 'playing');
  const [text, setText] = useState(selection?.name ?? '');

  const submit = () => {
    if (text.trim()) setManualActivity(kind, text.trim());
  };

  return (
    <div
      className="px-2 py-2 min-w-[240px]"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-txt-tertiary mb-1.5 px-1">
        {t('set_activity')}
      </div>

      {/* Kind selector */}
      <div className="grid grid-cols-4 gap-1 mb-2">
        {KINDS.map(({ type, emoji }) => (
          <button
            key={type}
            onClick={() => setKind(type)}
            title={t(KINDS.find((k) => k.type === type)!.labelKey)}
            className={`h-8 rounded-lg text-[15px] flex items-center justify-center transition-colors ${
              kind === type
                ? 'bg-white/[0.12] text-txt-primary'
                : 'bg-white/[0.04] text-txt-tertiary hover:bg-white/[0.08]'
            }`}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Free text */}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
            e.currentTarget.blur();
            // Close the context menu by clicking the backdrop is not exposed;
            // Escape closes it natively via the renderer's key handler.
          }
        }}
        placeholder={t('set_activity_placeholder')}
        maxLength={64}
        autoFocus
        className="w-full h-8 px-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[12px] text-txt-primary placeholder:text-txt-tertiary/60 outline-none focus:border-white/[0.2] transition-colors"
      />

      <div className="flex gap-1.5 mt-2">
        <button
          onClick={() => {
            submit();
          }}
          disabled={!text.trim()}
          className="flex-1 h-7 rounded-lg bg-accent-primary/20 text-accent-primary text-[11px] font-semibold hover:bg-accent-primary/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {t('set_activity_apply')}
        </button>
        {selection && (
          <button
            onClick={() => {
              clearManualActivity();
              setText('');
            }}
            className="flex-1 h-7 rounded-lg bg-white/[0.05] text-txt-tertiary text-[11px] font-semibold hover:bg-white/[0.1] hover:text-txt-primary transition-colors"
          >
            {t('set_activity_clear')}
          </button>
        )}
      </div>
    </div>
  );
}

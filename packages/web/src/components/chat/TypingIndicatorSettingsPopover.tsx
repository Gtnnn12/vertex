import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuthStore } from '../../stores/authStore';
import {
  useDmPreferencesStore,
  MAX_CUSTOM_TEXT_LENGTH,
  type TypingIndicatorMode,
  type TypingAnimation,
} from '../../stores/dmPreferencesStore';
import { formatTypingIndicator } from '../../utils/typingIndicator';
import { EmojiPicker } from './EmojiPicker';

interface TypingIndicatorSettingsPopoverProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
}

const MODES: { id: TypingIndicatorMode; labelKey: string; premium: boolean }[] = [
  { id: 'text', labelKey: 'dm_typing_mode_text', premium: false },
  { id: 'emoji', labelKey: 'dm_typing_mode_emoji', premium: false },
  { id: 'emoji_text', labelKey: 'dm_typing_mode_emoji_text', premium: false },
  { id: 'custom', labelKey: 'dm_typing_mode_custom', premium: true },
  { id: 'off', labelKey: 'dm_typing_mode_off', premium: false },
];

const ANIMATIONS: { id: TypingAnimation; labelKey: string; premium: boolean }[] = [
  { id: 'dots', labelKey: 'dm_typing_anim_dots', premium: false },
  { id: 'fade', labelKey: 'dm_typing_anim_fade', premium: false },
  { id: 'none', labelKey: 'dm_typing_anim_none', premium: false },
  { id: 'pulse', labelKey: 'dm_typing_anim_pulse', premium: true },
];

const EMOJI_SUGGESTIONS = ['✍️', '💬', '💭', '👀', '🔥', '🧑‍💻', '✨', '⌨️'];

export function TypingIndicatorSettingsPopover({
  anchorEl,
  onClose,
}: TypingIndicatorSettingsPopoverProps) {
  const { t } = useLanguage();
  const isNetrex = useAuthStore((s) => s.user?.netrexEnabled ?? false);

  const mode = useDmPreferencesStore((s) => s.typingMode);
  const customText = useDmPreferencesStore((s) => s.typingCustomText);
  const emoji = useDmPreferencesStore((s) => s.typingEmoji);
  const animation = useDmPreferencesStore((s) => s.typingAnimation);
  const setMode = useDmPreferencesStore((s) => s.setTypingMode);
  const setCustomText = useDmPreferencesStore((s) => s.setTypingCustomText);
  const setEmoji = useDmPreferencesStore((s) => s.setTypingEmoji);
  const setAnimation = useDmPreferencesStore((s) => s.setTypingAnimation);
  const reset = useDmPreferencesStore((s) => s.resetTypingIndicator);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const floatingRef = useRef<HTMLDivElement>(null);

  // Position above the anchor (same pattern as InputPopover).
  useEffect(() => {
    const anchor = anchorEl;
    const floating = floatingRef.current;
    if (!anchor || !floating) return;

    const update = () => {
      const anchorRect = anchor.getBoundingClientRect();
      const floatingRect = floating.getBoundingClientRect();
      const vw = window.innerWidth;

      let left = anchorRect.right - floatingRect.width;
      let top = anchorRect.top - floatingRect.height - 8;
      if (top < 8) top = anchorRect.bottom + 8;
      left = Math.max(8, Math.min(left, vw - floatingRect.width - 8));

      floating.style.top = `${top}px`;
      floating.style.left = `${left}px`;
    };

    update();
    const frame = requestAnimationFrame(update);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
    };
  }, [anchorEl]);

  // Click outside / Escape to close.
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const floating = floatingRef.current;
      if (!floating) return;
      if (floating.contains(e.target as Node)) return;
      if (anchorEl && anchorEl.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, anchorEl]);

  // Live preview using the real formatter (same code path as the indicator).
  const preview = useMemo(
    () =>
      formatTypingIndicator({
        mode,
        customText,
        emoji,
        animation,
        isNetrex,
        typingNames: ['zzz'],
        defaultTemplate: t('is_typing_template'),
        defaultTemplateTwo: t('are_typing_two'),
        defaultTemplateMany: t('several_people_are_typing'),
      }),
    [mode, customText, emoji, animation, isNetrex, t]
  );

  const needsText = mode === 'custom' || mode === 'emoji_text';

  return createPortal(
    <div
      ref={floatingRef}
      className="fixed z-[300] animate-slide-up"
      style={{ top: -9999, left: -9999 }}
    >
      <div className="glass rounded-xl w-[320px] max-h-[min(520px,calc(100vh-32px))] overflow-y-auto p-4">
        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[13px] font-bold text-txt-primary tracking-tight">
            {t('dm_personalization_title')}
          </h3>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md text-txt-tertiary hover:text-txt-primary hover:bg-white/[0.06] transition-colors"
            aria-label={t('close')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z" />
            </svg>
          </button>
        </div>

        {/* ── Live preview ── */}
        <div className="mb-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-txt-tertiary mb-1.5">
            {t('dm_typing_preview')}
          </div>
          <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 flex items-center gap-2 min-h-[38px]">
            {animation === 'dots' && preview.text && (
              <div className="flex gap-[2px] bg-surface-elevated/20 rounded-full px-1.5 py-1 flex-shrink-0">
                <div className="w-[4px] h-[4px] bg-txt-message rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '0.8s' }} />
                <div className="w-[4px] h-[4px] bg-txt-message rounded-full animate-bounce" style={{ animationDelay: '150ms', animationDuration: '0.8s' }} />
                <div className="w-[4px] h-[4px] bg-txt-message rounded-full animate-bounce" style={{ animationDelay: '300ms', animationDuration: '0.8s' }} />
              </div>
            )}
            {preview.emoji && <span className="text-[14px] leading-none">{preview.emoji}</span>}
            {preview.text ? (
              <span className="text-[12px] font-bold text-txt-secondary truncate">{preview.text}</span>
            ) : (
              <span className="text-[12px] text-txt-tertiary italic">{t('dm_typing_preview_hidden')}</span>
            )}
          </div>
        </div>

        {/* ── Mode selector ── */}
        <div className="mb-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-txt-tertiary mb-1.5">
            {t('dm_typing_mode_label')}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {MODES.map((m) => {
              const locked = m.premium && !isNetrex;
              return (
                <button
                  key={m.id}
                  onClick={() => !locked && setMode(m.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold transition-colors border ${
                    mode === m.id
                      ? 'bg-accent-primary/15 border-accent-primary/40 text-txt-primary'
                      : locked
                        ? 'bg-white/[0.02] border-white/[0.05] text-txt-tertiary/70 cursor-not-allowed'
                        : 'bg-white/[0.03] border-white/[0.06] text-txt-secondary hover:bg-white/[0.06] hover:text-txt-primary'
                  }`}
                  title={locked ? t('dm_typing_netrex_locked') : undefined}
                >
                  {locked && <span className="mr-1">✦</span>}
                  {t(m.labelKey)}
                </button>
              );
            })}
          </div>
          {!isNetrex && (
            <p className="mt-1.5 text-[10px] text-txt-tertiary/80">
              <span className="text-accent-peach">✦</span> {t('dm_typing_netrex_hint')}
            </p>
          )}
        </div>

        {/* ── Emoji + custom text ── */}
        {mode !== 'off' && mode !== 'text' && (
          <div className="mb-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-txt-tertiary mb-1.5">
              {t('dm_typing_emoji_label')}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {EMOJI_SUGGESTIONS.map((e) => (
                <button
                  key={e}
                  onClick={() => setEmoji(e)}
                  className={`w-8 h-8 rounded-lg text-[15px] flex items-center justify-center transition-colors border ${
                    emoji === e
                      ? 'bg-accent-primary/15 border-accent-primary/40'
                      : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]'
                  }`}
                >
                  {e}
                </button>
              ))}
              <button
                onClick={() => setShowEmojiPicker((v) => !v)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors border ${
                  showEmojiPicker
                    ? 'bg-accent-primary/15 border-accent-primary/40 text-accent-primary'
                    : 'bg-white/[0.03] border-white/[0.06] text-txt-tertiary hover:bg-white/[0.06]'
                }`}
                title={t('emoji_picker')}
                aria-label={t('emoji_picker')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5s.67 1.5 1.5 1.5zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
                </svg>
              </button>
            </div>
            {showEmojiPicker && (
              <div className="mt-2">
                <EmojiPicker
                  onEmojiSelect={(e) => {
                    setEmoji(e.native);
                    setShowEmojiPicker(false);
                  }}
                />
              </div>
            )}
            <input
              type="text"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              maxLength={12}
              className="mt-2 w-full rounded-lg bg-white/[0.04] border border-white/[0.07] px-2.5 py-1.5 text-[12px] text-txt-primary placeholder:text-txt-tertiary focus:outline-none focus:border-accent-primary/50"
              placeholder={t('dm_typing_emoji_placeholder')}
              aria-label={t('dm_typing_emoji_label')}
            />
          </div>
        )}

        {/* ── Custom text (per mode) ── */}
        {needsText && (
          <div className="mb-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-txt-tertiary mb-1.5">
              {t('dm_typing_custom_text_label')}
            </div>
            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              maxLength={MAX_CUSTOM_TEXT_LENGTH}
              className="w-full rounded-lg bg-white/[0.04] border border-white/[0.07] px-2.5 py-1.5 text-[12px] text-txt-primary placeholder:text-txt-tertiary focus:outline-none focus:border-accent-primary/50"
              placeholder={
                mode === 'custom'
                  ? t('dm_typing_custom_placeholder_template')
                  : t('dm_typing_custom_placeholder_phrase')
              }
              aria-label={t('dm_typing_custom_text_label')}
            />
            {mode === 'custom' && (
              <p className="mt-1.5 text-[10px] text-txt-tertiary/80">
                {t('dm_typing_placeholders_hint')}
              </p>
            )}
          </div>
        )}

        {/* ── Animation ── */}
        <div className="mb-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-txt-tertiary mb-1.5">
            {t('dm_typing_animation_label')}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ANIMATIONS.map((a) => {
              const locked = a.premium && !isNetrex;
              return (
                <button
                  key={a.id}
                  onClick={() => !locked && setAnimation(a.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold transition-colors border ${
                    animation === a.id
                      ? 'bg-accent-primary/15 border-accent-primary/40 text-txt-primary'
                      : locked
                        ? 'bg-white/[0.02] border-white/[0.05] text-txt-tertiary/70 cursor-not-allowed'
                        : 'bg-white/[0.03] border-white/[0.06] text-txt-secondary hover:bg-white/[0.06] hover:text-txt-primary'
                  }`}
                  title={locked ? t('dm_typing_netrex_locked') : undefined}
                >
                  {locked && <span className="mr-1">✦</span>}
                  {t(a.labelKey)}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Reset ── */}
        <div className="pt-1 border-t border-white/[0.06]">
          <button
            onClick={reset}
            className="w-full py-1.5 text-[11px] font-semibold text-txt-tertiary hover:text-txt-secondary transition-colors"
          >
            {t('dm_typing_reset')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

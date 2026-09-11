import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Per-user DM personalization (typing-indicator style). Local-only
 * persistence (localStorage via zustand persist) — same pattern as
 * uiStore / composerStore. Purely presentational: it changes how the
 * typing indicator looks for THIS viewer and is never sent to others.
 */

export type TypingIndicatorMode = 'text' | 'emoji' | 'emoji_text' | 'custom' | 'off';
export type TypingAnimation = 'none' | 'fade' | 'pulse' | 'dots';

/** Hard cap so custom text can't grow unbounded (abuse guard). */
export const MAX_CUSTOM_TEXT_LENGTH = 64;
/** Hard cap for the custom emoji combo string. */
export const MAX_EMOJI_LENGTH = 12;

export interface DmPreferencesState {
  typingMode: TypingIndicatorMode;
  /** Custom text used by `custom` / `emoji_text` modes. Supports {user}. */
  typingCustomText: string;
  /** Emoji(s) used by `emoji` / `emoji_text` / `custom` modes. */
  typingEmoji: string;
  typingAnimation: TypingAnimation;
  setTypingMode: (mode: TypingIndicatorMode) => void;
  setTypingCustomText: (text: string) => void;
  setTypingEmoji: (emoji: string) => void;
  setTypingAnimation: (anim: TypingAnimation) => void;
  resetTypingIndicator: () => void;
}

const DEFAULTS = {
  typingMode: 'text' as TypingIndicatorMode,
  typingCustomText: '',
  typingEmoji: '💬',
  typingAnimation: 'dots' as TypingAnimation,
};

export const useDmPreferencesStore = create<DmPreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULTS,

      setTypingMode: (mode) => set({ typingMode: mode }),
      setTypingCustomText: (text) =>
        set({ typingCustomText: text.slice(0, MAX_CUSTOM_TEXT_LENGTH) }),
      setTypingEmoji: (emoji) => set({ typingEmoji: emoji.slice(0, MAX_EMOJI_LENGTH) }),
      setTypingAnimation: (anim) => set({ typingAnimation: anim }),
      resetTypingIndicator: () => set({ ...DEFAULTS }),
    }),
    {
      name: 'vertex.dm-preferences@v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        typingMode: s.typingMode,
        typingCustomText: s.typingCustomText,
        typingEmoji: s.typingEmoji,
        typingAnimation: s.typingAnimation,
      }),
    }
  )
);

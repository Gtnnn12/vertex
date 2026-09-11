import type { TypingIndicatorMode, TypingAnimation } from '../stores/dmPreferencesStore';

export interface TypingRenderResult {
  /** Leading emoji (may be ''), already length-capped. */
  emoji: string;
  /** Main text, safe (no HTML — it's rendered as a React text node). */
  text: string;
  /** Animation key to apply (empty string when disabled). */
  animation: TypingAnimation;
  /** True when the user picked a Netrex-gated style but lacks the entitlement. */
  gated: boolean;
}

/**
 * Which styles require Netrex. Free: text, emoji, emoji_text, off, plus the
 * base animations (none / fade). Netrex: the fully custom `{emoji} {user} …`
 * template mode, the pulse/bounce animations, and all presets.
 */
export const TYPING_PREMIUM_MODES: TypingIndicatorMode[] = ['custom'];
export const TYPING_PREMIUM_ANIMATIONS: TypingAnimation[] = ['pulse'];

/**
 * Build the rendered typing-indicator content from the user's preferences.
 *
 * SECURITY: output is plain strings consumed as React text nodes — never
 * HTML. `{user}` placeholders are substituted from the typing users' names,
 * and every interpolation source is stripped of angle brackets so nothing can
 * be smuggled through.
 */
export function formatTypingIndicator(opts: {
  mode: TypingIndicatorMode;
  customText: string;
  emoji: string;
  animation: TypingAnimation;
  isNetrex: boolean;
  /** Display names of the users currently typing (excluding self). */
  typingNames: string[];
  /** Localized default template: "{name} is typing..." */
  defaultTemplate: string;
  /** Localized template for two typers: "{name1} and {name2} are typing..." */
  defaultTemplateTwo: string;
  /** Localized fallback for 3+ typers. */
  defaultTemplateMany: string;
}): TypingRenderResult {
  const {
    mode, customText, emoji, animation, isNetrex,
    typingNames, defaultTemplate, defaultTemplateTwo, defaultTemplateMany,
  } = opts;

  // Resolve names safely: strip anything HTML-ish at the source.
  const names = typingNames.map((n) => stripUnsafe(n));
  const firstName = names[0] ?? '';

  let gated = false;
  let effectiveMode = mode;
  if (TYPING_PREMIUM_MODES.includes(mode) && !isNetrex) {
    gated = true;
    effectiveMode = 'text'; // graceful fallback, never blocked-looking
  }
  let effectiveAnim = animation;
  if (TYPING_PREMIUM_ANIMATIONS.includes(animation) && !isNetrex) {
    gated = true;
    effectiveAnim = 'dots';
  }

  // Several people: keep the plain localized string regardless of mode, but
  // still respect "off" and the emoji prefix if the user chose one.
  if (names.length > 2) {
    if (effectiveMode === 'off') return { emoji: '', text: '', animation: effectiveAnim, gated };
    const text = effectiveMode === 'emoji' ? '' : defaultTemplateMany;
    return { emoji: effectiveMode === 'text' ? '' : emoji, text, animation: effectiveAnim, gated };
  }

  const template =
    names.length === 2
      ? defaultTemplateTwo.replace('{name1}', names[0] ?? '').replace('{name2}', names[1] ?? '')
      : defaultTemplate.replace('{name}', firstName);

  switch (effectiveMode) {
    case 'off':
      return { emoji: '', text: '', animation: effectiveAnim, gated };

    case 'emoji':
      // Emoji only, no name text.
      return { emoji, text: '', animation: effectiveAnim, gated };

    case 'emoji_text': {
      // "{emoji} {user} {customText}" — customText falls back to the default
      // template when empty.
      const body = customText.trim()
        ? customText.replace(/\{user\}/g, firstName)
        : template;
      return { emoji, text: stripUnsafe(body), animation: effectiveAnim, gated };
    }

    case 'custom': {
      // Free-form template. Supported placeholders: {user}, {emoji}.
      const raw = customText.trim()
        ? customText
        : '{emoji} {user} ...';
      const text = stripUnsafe(
        raw.replace(/\{emoji\}/g, emoji).replace(/\{user\}/g, firstName)
      );
      return { emoji: '', text, animation: effectiveAnim, gated };
    }

    case 'text':
    default:
      return { emoji: '', text: template, animation: effectiveAnim, gated };
  }
}

/**
 * Remove characters that could be interpreted as markup. The result is only
 * ever rendered as a React text node, but this keeps the data inert even if a
 * future consumer renders it elsewhere.
 */
export function stripUnsafe(input: string): string {
  return input.replace(/[<>`]/g, '');
}

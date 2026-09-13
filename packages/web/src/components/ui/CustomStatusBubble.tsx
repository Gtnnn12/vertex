import React from 'react';

/**
 * Discord-style custom-status bubble for profile surfaces (popout + modal).
 * A rounded pill that "hangs" from a small tail pointing up at the avatar,
 * elevated surface + hairline border, legible text, 120ms fade+scale entrance
 * (fully disabled under prefers-reduced-motion via the .status-bubble-in
 * media query in globals.css).
 *
 * Renders NOTHING when there is no status — no reserved space, per spec.
 */
export function CustomStatusBubble({ status }: { status: string | null | undefined }) {
  const text = status?.trim();
  if (!text) return null;

  return (
    <div className="relative inline-block mt-2">
      {/* Tail — a small rotated square peeking out of the bubble's top-left,
          pointing at the avatar above. */}
      <span
        aria-hidden
        className="status-bubble-in absolute -top-[5px] left-5 w-2.5 h-2.5 rotate-45 bg-surface-elevated border-l border-t border-white/[0.08]"
      />
      <div
        data-custom-status-bubble
        className="status-bubble-in relative inline-flex items-center max-w-full gap-1.5 px-3 py-1.5 rounded-xl bg-surface-elevated border border-white/[0.08] shadow-[0_2px_10px_-4px_rgba(0,0,0,0.4)]"
      >
        <span className="text-[12.5px] leading-snug text-txt-secondary break-words">
          {text}
        </span>
      </div>
    </div>
  );
}

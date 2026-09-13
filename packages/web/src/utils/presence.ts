/**
 * Single source of truth for presence (status) colors and labels.
 *
 * Every surface that paints a presence indicator — the presence selector,
 * member grids, avatars (via the --status-* theme tokens) — must consume
 * this map or the theme tokens it mirrors. Never hardcode a status color
 * inside a component.
 *
 * tailwindClass mirrors the CSS variables in globals.css (`--status-*`), which
 * drive the Tailwind `bg-status-*` / `text-status-*` utilities; hex is the
 * same color as a literal for inline styles (canvas/SVG contexts). Both stay
 * in sync with the theme tokens, so light mode and custom themes follow
 * automatically wherever the class variants are used.
 */

export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'offline';

export interface PresenceMeta {
  /** i18n key for the label. */
  labelKey: string;
  /** Tailwind class bound to the --status-* theme token (light mode safe). */
  tailwindClass: string;
  /** Same color as a literal, for inline-style contexts (never for DOM nodes that could use tailwindClass). */
  hex: string;
}

export const PRESENCE_META: Record<PresenceStatus, PresenceMeta> = {
  online: { labelKey: 'online', tailwindClass: 'bg-status-online', hex: 'rgb(var(--status-online))' },
  idle: { labelKey: 'idle', tailwindClass: 'bg-status-idle', hex: 'rgb(var(--status-idle))' },
  dnd: { labelKey: 'do_not_disturb', tailwindClass: 'bg-status-dnd', hex: 'rgb(var(--status-dnd))' },
  offline: { labelKey: 'invisible', tailwindClass: 'bg-status-offline', hex: 'rgb(var(--status-offline))' },
};

/** Ordered list for selectors/menus: online → idle → dnd → invisible. */
export const PRESENCE_ORDER: PresenceStatus[] = ['online', 'idle', 'dnd', 'offline'];

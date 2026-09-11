import type { BoardWidget } from '@backspace/shared';
import { BOARD_WIDGET_TYPES, MAX_BOARD_WIDGETS } from '@backspace/shared';

/**
 * Resolve a stored image reference to a URL: http/https absolute stays,
 * /api/uploads/ path stays, bare filename → the local uploads URL.
 */
export function resolveUploadSrc(src: string): string {
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/')) return src;
  return `/api/uploads/${src}`;
}

const BOARD_TYPE_SET = new Set<string>(BOARD_WIDGET_TYPES);

/**
 * Client-side defensive validation mirroring the server's rules. The SERVER
 * remains the authority; this gives the editor instant feedback and keeps
 * malformed widgets out of optimistic saves.
 */
export function validateBoardWidgets(widgets: BoardWidget[]): { ok: boolean; error?: 'too_many' | 'bad_type' | 'bad_url' | 'too_long' } {
  if (widgets.length > MAX_BOARD_WIDGETS) return { ok: false, error: 'too_many' };
  const seen = new Set<string>();
  for (const w of widgets) {
    if (!BOARD_TYPE_SET.has(w.type) || !w.id || seen.has(w.id)) return { ok: false, error: 'bad_type' };
    seen.add(w.id);
  }
  return { ok: true };
}

/** http/https only — mirrors the server gate. */
export function isSafeHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Internal image ref (upload or absolute http/https). */
export function isSafeImageUrl(value: string): boolean {
  if (!value) return false;
  if (isSafeHttpUrl(value)) return true;
  return !value.includes('/') || value.startsWith('/api/uploads/');
}

export function makeWidgetId(): string {
  return `bw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

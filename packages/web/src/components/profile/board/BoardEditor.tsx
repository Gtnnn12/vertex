import React, { useMemo, useState } from 'react';
import type { BoardWidget, BoardWidgetType } from '@backspace/shared';
import { MAX_BOARD_WIDGETS, BOARD_FIELD_LIMITS as L } from '@backspace/shared';
import { Reorder, DragControls, type DragControls as DragControlsType } from 'framer-motion';
import { useLanguage } from '../../../contexts/LanguageContext';
import { WIDGET_REGISTRY, WIDGET_CATALOG, WidgetCardShell } from './widgetRegistry';
import { isSafeHttpUrl, isSafeImageUrl, makeWidgetId } from './boardUtils';

interface BoardEditorProps {
  initialWidgets: BoardWidget[];
  lookupUserId: string;
  saving: boolean;
  onSave: (widgets: BoardWidget[]) => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Edit mode for the board. Also fully registry-driven: the config form per
 * widget type comes from a FIELD EDITORS map (one entry per type), and the
 * card preview is the same WidgetCardShell + renderer used in view mode.
 */
export function BoardEditor({ initialWidgets, lookupUserId, saving, onSave, onCancel }: BoardEditorProps) {
  const { t } = useLanguage();
  const [widgets, setWidgets] = useState<BoardWidget[]>(initialWidgets);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialWidgets[0]?.id ?? null);

  const selected = widgets.find((w) => w.id === selectedId) ?? null;
  const selectedDef = selected ? WIDGET_REGISTRY[selected.type] : null;
  const catalogTypes = useMemo(
    () => WIDGET_CATALOG.filter((d) => !widgets.some((w) => w.type === d.type) || allowsMultiple(d.type)),
    [widgets],
  );

  function allowsMultiple(type: BoardWidgetType): boolean {
    // One per board keeps it clean; every type is single-instance for now.
    void type;
    return false;
  }

  const update = (id: string, config: Record<string, unknown>) => {
    setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, config } : w)));
  };
  const remove = (id: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
    dragControlsMap.delete(id);
    if (selectedId === id) setSelectedId(null);
  };
  const move = (index: number, dir: -1 | 1) => {
    setWidgets((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };
  const add = (type: BoardWidgetType) => {
    if (widgets.length >= MAX_BOARD_WIDGETS) return;
    const def = WIDGET_REGISTRY[type];
    const w: BoardWidget = { id: makeWidgetId(), type, visible: true, config: def.defaultConfig() };
    setWidgets((prev) => [...prev, w]);
    setSelectedId(w.id);
    setCatalogOpen(false);
  };

  const dirty = JSON.stringify(widgets) !== JSON.stringify(initialWidgets);

  return (
    <div className="board-editor">
      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setCatalogOpen((v) => !v)}
          disabled={widgets.length >= MAX_BOARD_WIDGETS}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent-primary px-3 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-accent-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
          {t('board_add_widget')}
        </button>
        <span className="text-[11px] tabular-nums text-txt-tertiary">
          {widgets.length}/{MAX_BOARD_WIDGETS}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-[12px] font-semibold text-txt-secondary transition-colors hover:bg-white/[0.06] hover:text-txt-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
          >
            {t('board_cancel')}
          </button>
          <button
            type="button"
            onClick={() => void onSave(widgets)}
            disabled={saving || !dirty}
            className="rounded-lg bg-accent-primary px-3 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-accent-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? t('board_saving') : t('board_save')}
          </button>
        </div>
      </div>

      {/* Catalog */}
      {catalogOpen && (
        <div className="board-catalog mb-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-txt-tertiary">
            {t('board_catalog_title')}
          </p>
          <div className="grid grid-cols-1 gap-1.5 min-[420px]:grid-cols-2">
            {catalogTypes.map((def) => (
              <button
                key={def.type}
                type="button"
                onClick={() => add(def.type)}
                className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2 text-left transition-colors hover:border-white/[0.12] hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-primary/40"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-txt-secondary" aria-hidden>
                  {def.icon}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-semibold text-txt-primary">{t(def.labelKey)}</span>
                  <span className="block text-[11px] leading-snug text-txt-tertiary">{t(def.descKey)}</span>
                </span>
              </button>
            ))}
          </div>
          {catalogTypes.length === 0 && (
            <p className="text-[12px] text-txt-tertiary">{t('board_catalog_full')}</p>
          )}
        </div>
      )}

      {/* Widgets — accessible reorder + drag (framer-motion Reorder, already a dependency) */}
      {widgets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/[0.09] px-4 py-8 text-center text-[12px] text-txt-tertiary">
          {t('board_editor_empty')}
        </div>
      ) : (
        <Reorder.Group
          axis="y"
          values={widgets}
          onReorder={setWidgets}
          className="space-y-2"
          as="ul"
        >
          {widgets.map((w, i) => {
            const def = WIDGET_REGISTRY[w.type];
            // One DragControls instance per item — created outside hooks
            // (hooks in map callbacks are forbidden). It only wires the
            // drag handle to framer's Reorder.Item.
            const controls = dragControlsMap.get(w.id) ?? dragControlsMap.set(w.id, new DragControls()).get(w.id)!;
            return (
              <Reorder.Item
                key={w.id}
                value={w}
                dragListener={false}
                dragControls={controls as DragControlsType}
                as="li"
                className={`rounded-xl border bg-white/[0.02] p-2.5 transition-colors ${
                  selectedId === w.id
                    ? 'border-accent-primary/50 ring-1 ring-accent-primary/25'
                    : 'border-white/[0.07] hover:border-white/[0.12]'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {/* Drag handle */}
                  <button
                    type="button"
                    onPointerDown={(e) => controls.start(e)}
                    className="cursor-grab touch-none rounded-md p-1 text-txt-tertiary transition-colors hover:bg-white/[0.06] hover:text-txt-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30 active:cursor-grabbing"
                    aria-label={t('board_drag_handle')}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M9 5a2 2 0 114 0 2 2 0 01-4 0zm0 7a2 2 0 114 0 2 2 0 01-4 0zm0 7a2 2 0 114 0 2 2 0 01-4 0z" />
                    </svg>
                  </button>
                  {/* Accessible reorder: subir/bajar */}
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="rounded-md p-1 text-txt-tertiary transition-colors hover:bg-white/[0.06] hover:text-txt-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30 disabled:opacity-30"
                    aria-label={t('board_move_up')}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 8l6 6H6z" /></svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === widgets.length - 1}
                    className="rounded-md p-1 text-txt-tertiary transition-colors hover:bg-white/[0.06] hover:text-txt-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30 disabled:opacity-30"
                    aria-label={t('board_move_down')}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 16l-6-6h12z" /></svg>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedId(w.id === selectedId ? null : w.id)}
                    className="ml-1 flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-txt-secondary" aria-hidden>
                      {def?.icon}
                    </span>
                    <span className="truncate text-[12px] font-semibold text-txt-primary">
                      {def ? t(def.labelKey) : w.type}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => remove(w.id)}
                    className="rounded-md p-1 text-txt-tertiary transition-colors hover:bg-txt-danger/10 hover:text-txt-danger focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-txt-danger/40"
                    aria-label={t('board_remove_widget')}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M6 19a2 2 0 002 2h8a2 2 0 002-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                    </svg>
                  </button>
                </div>

                {/* Selected: live config form + preview */}
                {selectedId === w.id && def && (
                  <div className="mt-2.5 space-y-2.5 border-t border-white/[0.06] pt-2.5">
                    <FieldEditor type={w.type} config={w.config} onChange={(cfg) => update(w.id, cfg)} />
                    <div>
                      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-txt-tertiary">
                        {t('board_preview')}
                      </p>
                      <WidgetCardShell icon={def.icon} labelKey={def.labelKey} accent={def.accent}>
                        <def.Renderer config={w.config} lookupUserId={lookupUserId} isSelf />
                      </WidgetCardShell>
                    </div>
                  </div>
                )}
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
      )}
    </div>
  );
}

/** One DragControls per widget id, stable across renders. */
const dragControlsMap = new Map<string, DragControls>();


// ─── Field editors (one per widget type — the registry's editing half) ──────

interface FieldEditorProps {
  type: BoardWidgetType;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

function TextField({ label, value, max, placeholder, onChange }: { label: string; value: string; max: number; placeholder?: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-txt-tertiary">{label}</span>
      <input
        type="text"
        value={value}
        maxLength={max}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/[0.09] bg-white/[0.04] px-2.5 py-1.5 text-[12px] text-txt-primary placeholder:text-txt-tertiary/60 focus:border-accent-primary/50 focus:outline-none focus:ring-1 focus:ring-accent-primary/30"
      />
    </label>
  );
}

function FieldEditor({ type, config, onChange }: FieldEditorProps) {
  const { t } = useLanguage();
  const set = (patch: Record<string, unknown>) => onChange({ ...config, ...patch });
  const str = (k: string) => (typeof config[k] === 'string' ? (config[k] as string) : '');

  switch (type) {
    case 'favorite-game':
      return (
        <div className="space-y-2">
          <TextField label={t('board_field_title')} value={str('title')} max={L.gameTitle} onChange={(v) => set({ title: v })} />
          <TextField label={t('board_field_description')} value={str('description')} max={L.gameDesc} onChange={(v) => set({ description: v })} />
          <TextField label={t('board_field_cover_url')} value={str('coverUrl')} max={L.gameCoverUrl} placeholder="https://…" onChange={(v) => set({ coverUrl: v })} />
          {str('coverUrl') && !isSafeImageUrl(str('coverUrl')) && (
            <p className="text-[11px] text-txt-danger">{t('board_field_bad_url')}</p>
          )}
        </div>
      );
    case 'now-song':
      return <p className="text-[12px] text-txt-tertiary">{t('board_field_now_song_hint')}</p>;
    case 'quote':
      return (
        <div className="space-y-2">
          <TextField label={t('board_field_quote')} value={str('text')} max={L.quote} onChange={(v) => set({ text: v })} />
          <TextField label={t('board_field_author')} value={str('author')} max={32} onChange={(v) => set({ author: v })} />
        </div>
      );
    case 'mood':
      return (
        <div className="space-y-2">
          <div className="flex gap-2">
            <label className="w-16 shrink-0">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-txt-tertiary">{t('board_field_emoji')}</span>
              <input
                type="text"
                value={str('emoji')}
                maxLength={L.moodEmoji}
                onChange={(e) => set({ emoji: e.target.value })}
                className="w-full rounded-lg border border-white/[0.09] bg-white/[0.04] px-2 py-1.5 text-center text-[14px] focus:border-accent-primary/50 focus:outline-none"
              />
            </label>
            <div className="min-w-0 flex-1">
              <TextField label={t('board_field_mood_text')} value={str('text')} max={L.moodText} onChange={(v) => set({ text: v })} />
            </div>
          </div>
          <label className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-txt-tertiary">{t('board_field_color')}</span>
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(str('color')) ? str('color') : '#57f287'}
              onChange={(e) => set({ color: e.target.value })}
              className="h-7 w-10 cursor-pointer rounded border border-white/[0.09] bg-transparent"
            />
          </label>
        </div>
      );
    case 'social-links': {
      const links = Array.isArray(config.links) ? (config.links as Array<{ label: string; url: string }>) : [];
      const anyBad = links.some((l) => l.url && !isSafeHttpUrl(l.url));
      return (
        <div className="space-y-2">
          {links.map((l, i) => (
            <div key={i} className="flex gap-1.5">
              <input
                type="text"
                value={l.label}
                maxLength={L.linkLabel}
                placeholder={t('board_field_link_label')}
                onChange={(e) => {
                  const next = [...links];
                  next[i] = { ...l, label: e.target.value };
                  set({ links: next });
                }}
                className="w-1/3 rounded-lg border border-white/[0.09] bg-white/[0.04] px-2 py-1.5 text-[12px] text-txt-primary placeholder:text-txt-tertiary/60 focus:border-accent-primary/50 focus:outline-none"
              />
              <input
                type="url"
                value={l.url}
                maxLength={L.linkUrl}
                placeholder="https://…"
                onChange={(e) => {
                  const next = [...links];
                  next[i] = { ...l, url: e.target.value };
                  set({ links: next });
                }}
                className={`min-w-0 flex-1 rounded-lg border bg-white/[0.04] px-2 py-1.5 text-[12px] text-txt-primary placeholder:text-txt-tertiary/60 focus:outline-none focus:ring-1 ${
                  l.url && !isSafeHttpUrl(l.url)
                    ? 'border-txt-danger/60 focus:ring-txt-danger/30'
                    : 'border-white/[0.09] focus:border-accent-primary/50 focus:ring-accent-primary/30'
                }`}
              />
              <button
                type="button"
                onClick={() => set({ links: links.filter((_, j) => j !== i) })}
                className="shrink-0 rounded-md px-1.5 text-txt-tertiary transition-colors hover:text-txt-danger"
                aria-label={t('board_field_link_remove')}
              >
                ×
              </button>
            </div>
          ))}
          {links.length < L.maxLinks && (
            <button
              type="button"
              onClick={() => set({ links: [...links, { label: '', url: '' }] })}
              className="rounded-lg border border-white/[0.09] px-2.5 py-1 text-[11px] font-semibold text-txt-secondary transition-colors hover:bg-white/[0.06]"
            >
              + {t('board_field_link_add')}
            </button>
          )}
          {anyBad && <p className="text-[11px] text-txt-danger">{t('board_field_only_http')}</p>}
        </div>
      );
    }
    case 'badges': {
      // SECURITY: staff badges are NOT selectable — the widget auto-populates
      // with the badges the user actually owns (rendered by BadgesValue from
      // the auth store; the server also filters fakes on save).
      return (
        <p className="text-[11px] leading-snug text-txt-tertiary">{t('board_field_badges_auto')}</p>
      );
    }
    case 'goal':
      return (
        <div className="space-y-2">
          <TextField label={t('board_field_goal')} value={str('title')} max={L.goalTitle} onChange={(v) => set({ title: v })} />
          <label className="block">
            <span className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.14em] text-txt-tertiary">
              {t('board_field_progress')}
              <span className="tabular-nums">{typeof config.progress === 'number' ? config.progress : 0}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={typeof config.progress === 'number' ? config.progress : 0}
              onChange={(e) => set({ progress: Number(e.target.value) })}
              className="w-full accent-[rgb(var(--accent-primary))]"
            />
          </label>
        </div>
      );
    case 'friend-spotlight':
      return (
        <div className="space-y-2">
          <TextField label={t('board_field_friend_name')} value={str('name')} max={L.friendName} onChange={(v) => set({ name: v })} />
          <TextField label={t('board_field_friend_message')} value={str('message')} max={L.friendMessage} onChange={(v) => set({ message: v })} />
          <TextField label={t('board_field_avatar_url')} value={str('avatarUrl')} max={L.friendAvatarUrl} placeholder="https://… /uploads/…" onChange={(v) => set({ avatarUrl: v })} />
        </div>
      );
    case 'top-games': {
      const games = Array.isArray(config.games) ? (config.games as Array<{ title: string; coverUrl?: string }>) : [];
      return (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-1.5">
              <input
                type="text"
                value={games[i]?.title ?? ''}
                maxLength={L.gameTitle}
                placeholder={`${t('board_field_game')} #${i + 1}`}
                onChange={(e) => {
                  const next = [...games];
                  next[i] = { ...next[i], title: e.target.value };
                  set({ games: next });
                }}
                className="min-w-0 flex-1 rounded-lg border border-white/[0.09] bg-white/[0.04] px-2 py-1.5 text-[12px] text-txt-primary placeholder:text-txt-tertiary/60 focus:border-accent-primary/50 focus:outline-none"
              />
              <input
                type="text"
                value={games[i]?.coverUrl ?? ''}
                maxLength={L.gameCoverUrl}
                placeholder={t('board_field_cover_short')}
                onChange={(e) => {
                  const next = [...games];
                  next[i] = { title: next[i]?.title ?? '', coverUrl: e.target.value };
                  set({ games: next });
                }}
                className="min-w-0 flex-1 rounded-lg border border-white/[0.09] bg-white/[0.04] px-2 py-1.5 text-[12px] text-txt-primary placeholder:text-txt-tertiary/60 focus:border-accent-primary/50 focus:outline-none"
              />
            </div>
          ))}
        </div>
      );
    }
    case 'wishlist': {
      const items = Array.isArray(config.items) ? (config.items as string[]) : [];
      return (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex gap-1.5">
              <input
                type="text"
                value={item}
                maxLength={L.wishlistItem}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = e.target.value;
                  set({ items: next });
                }}
                className="min-w-0 flex-1 rounded-lg border border-white/[0.09] bg-white/[0.04] px-2 py-1.5 text-[12px] text-txt-primary focus:border-accent-primary/50 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => set({ items: items.filter((_, j) => j !== i) })}
                className="shrink-0 rounded-md px-1.5 text-txt-tertiary transition-colors hover:text-txt-danger"
                aria-label={t('board_field_wishlist_remove')}
              >
                ×
              </button>
            </div>
          ))}
          {items.length < L.maxWishlistItems && (
            <button
              type="button"
              onClick={() => set({ items: [...items, ''] })}
              className="rounded-lg border border-white/[0.09] px-2.5 py-1 text-[11px] font-semibold text-txt-secondary transition-colors hover:bg-white/[0.06]"
            >
              + {t('board_field_wishlist_add')}
            </button>
          )}
        </div>
      );
    }
    default:
      return null;
  }
}

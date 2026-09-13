import React, { useMemo, useState } from 'react';
import type { BoardWidget, User } from '@backspace/shared';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useAuthStore } from '../../../stores/authStore';
import { useUIStore } from '../../../stores/uiStore';
import { getApiForOrigin, resolveUserOrigin } from '../../../stores/spaceStore';
import { WIDGET_REGISTRY } from './widgetRegistry';
import { SpotifyVinylBlock } from '../../spotify/SpotifyVinylBlock';
import { BoardEditor } from './BoardEditor';
import { useProfileBoard } from './useProfileBoard';

interface ProfileBoardTabProps {
  user: User;
  origin: string;
  /** Called after a successful save so the modal can refresh its user view. */
  onBoardSaved?: (widgets: BoardWidget[]) => void;
  /** Controlled editor state: the "+ Añadir widget" button lives in the
      modal's board header (row 2), so the modal opens the editor here. */
  externalEditing?: boolean;
  onExternalEditingChange?: (editing: boolean) => void;
}

/**
 * THE board tab. One component: maps the user's ordered widget list and
 * renders each type with its registry renderer. Everything else (locked
 * state, editor hosting, empty state) is a mode of THIS component.
 */
export function ProfileBoardTab({ user, origin, onBoardSaved, externalEditing, onExternalEditingChange }: ProfileBoardTabProps) {
  const { t } = useLanguage();
  const currentUser = useAuthStore((s) => s.user);
  const setNetrexPurchaseOpen = useUIStore((s) => s.setNetrexPurchaseOpen);

  const isSelfProfile = !!(
    currentUser &&
    (currentUser.id === user.id ||
      (user.homeUserId && user.homeUserId === (currentUser.homeUserId ?? currentUser.id)))
  );
  const canEdit = isSelfProfile && currentUser?.netrexEnabled === true;
  const lockedSelf = isSelfProfile && !canEdit;

  const widgets = useMemo<BoardWidget[]>(
    () => (Array.isArray(user.profileBoard) ? user.profileBoard : []),
    [user.profileBoard],
  );
  // Editor state: externally controlled when the modal drives it (its header
  // hosts the add button), local fallback otherwise.
  const [localEditing, setLocalEditing] = useState(false);
  const editing = externalEditing ?? localEditing;
  const setEditing = (v: boolean) => {
    setLocalEditing(v);
    onExternalEditingChange?.(v);
  };
  const [displayed, setDisplayed] = useState<BoardWidget[] | null>(null);
  const shown = displayed ?? widgets;
  const { saveBoard, saving } = useProfileBoard();

  // ── Locked (own profile, no Netrex): the showcase CTA ──
  if (lockedSelf) {
    return (
      <div className="board-locked flex flex-col items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.02] px-6 py-10 text-center">
        <span
          className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-accent-peach/30 bg-accent-peach/10 text-accent-peach shadow-[0_0_18px_-4px_rgba(252,165,165,0.45)]"
          aria-hidden
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.84V12H5V6.3l7-3.11v8.8z" />
          </svg>
        </span>
        <h3 className="text-[14px] font-bold text-txt-primary">{t('board_locked_title')}</h3>
        <p className="mt-1.5 max-w-[280px] text-[12px] leading-relaxed text-txt-secondary">
          {t('board_locked_desc')}
        </p>
        <button
          type="button"
          onClick={() => setNetrexPurchaseOpen(true)}
          className="mt-4 rounded-xl border border-accent-peach/40 bg-accent-peach/15 px-5 py-2.5 text-[13px] font-bold text-accent-peach transition-all duration-200 hover:border-accent-peach/60 hover:bg-accent-peach/25 hover:shadow-[0_6px_20px_-8px_rgba(252,165,165,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-peach/50 motion-safe:hover:-translate-y-0.5"
        >
          {t('board_unlock_netrex')}
        </button>
      </div>
    );
  }

  // ── Editor mode (self + Netrex) ──
  if (editing) {
    return (
      <BoardEditor
        initialWidgets={widgets}
        lookupUserId={user.homeUserId ?? user.id}
        saving={saving}
        onCancel={() => {
          setDisplayed(null);
          setEditing(false);
        }}
        onSave={async (next) => {
          const api = getApiForOrigin(origin || resolveUserOrigin(user));
          const ok = await saveBoard(next, {
            api,
            onRollback: (finalWidgets) => {
              setDisplayed(finalWidgets);
              onBoardSaved?.(finalWidgets);
            },
          });
          if (ok) {
            setDisplayed(null);
            setEditing(false);
          }
        }}
      />
    );
  }

  // ── View mode ──
  // NOTE: the "+ Añadir widget" button lives in the MODAL's board header
  // (row 2) — it must not be duplicated here. This component only renders
  // widgets + empty state (with its own inline add for that context).
  return (
    <div>
      {shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.09] px-6 py-10 text-center">
          <p className="text-[13px] text-txt-secondary">
            {canEdit ? t('board_empty_own') : t('board_empty_other')}
          </p>
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-3 rounded-lg bg-accent-primary px-4 py-2 text-[12px] font-bold text-white transition-colors hover:bg-accent-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
            >
              {t('board_add_widget')}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 min-[420px]:items-start">
          {shown.map((w) => {
            const def = WIDGET_REGISTRY[w.type];
            if (!def || w.visible === false) return null;
            const { Renderer } = def;
            return (
              <Renderer
                key={w.id}
                config={w.config}
                lookupUserId={user.homeUserId ?? user.id}
                isSelf={isSelfProfile}
              />
            );
          })}
        </div>
      )}

      {/* Spotify — the "now playing" block LAST (game → quote → music),
          FULL size. Netrex-gated: the block itself resolves the style. */}
      <div className="mt-4">
        <SpotifyVinylBlock lookupUserId={user.homeUserId ?? user.id} isSelf={isSelfProfile} />
      </div>
    </div>
  );
}

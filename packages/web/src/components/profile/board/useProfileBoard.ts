import { useCallback, useRef, useState } from 'react';
import type { BoardWidget } from '@vertex/shared';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useUIStore } from '../../../stores/uiStore';
import { getApiForOrigin } from '../../../stores/spaceStore';
import { HttpError, NetworkError } from '../../../api/client';
import { validateBoardWidgets } from './boardUtils';

type SaveState = 'idle' | 'saving' | 'error';

interface SaveBoardOpts {
  api: ReturnType<typeof getApiForOrigin>;
  onRollback: (finalWidgets: BoardWidget[]) => void;
}

interface UseProfileBoardResult {
  /** Persist the given widget list. Optimistic: resolves on server echo, rolls back + toasts on failure. */
  saveBoard: (next: BoardWidget[], opts: SaveBoardOpts) => Promise<boolean>;
  saving: boolean;
  /** True when the last save failed (after rollback) — surfaces the error state. */
  saveError: boolean;
}

/**
 * Board persistence with optimistic update + rollback (the same contract the
 * music-style preference uses). The SERVER re-validates everything and gates
 * on Netrex — a 403 here means the entitlement lapsed mid-edit.
 */
export function useProfileBoard(): UseProfileBoardResult {
  const { t } = useLanguage();
  const addToast = useUIStore((s) => s.addToast);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const inFlight = useRef(false);

  const saveBoard = useCallback(async (
    next: BoardWidget[],
    opts: SaveBoardOpts,
  ): Promise<boolean> => {
    if (inFlight.current) return false;
    const check = validateBoardWidgets(next);
    if (!check.ok) {
      addToast(t('board_save_invalid'), 'warning');
      return false;
    }
    inFlight.current = true;
    setSaving(true);
    setSaveError(false);
    try {
      const res = await opts.api.users.saveBoard(next);
      // Server echo is the stored truth (it may have dropped/truncated fields).
      opts.onRollback((res.widgets ?? next) as BoardWidget[]);
      return true;
    } catch (err) {
      setSaveError(true);
      // Honest messages: "no connection" ONLY when the request never reached
      // the server (NetworkError) or the dev proxy answered with a bare 5xx;
      // the Netrex text for the 403 gate; the server's own text otherwise.
      let message: string;
      if (err instanceof NetworkError) {
        message = t('board_save_offline');
      } else if (err instanceof HttpError && err.status === 403) {
        message = t('board_save_netrex_denied');
      } else if (err instanceof HttpError && err.status >= 500) {
        message = t('board_save_offline');
      } else {
        message = t('board_save_failed');
      }
      addToast(message, 'warning');
      return false;
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }, [addToast, t]);

  return { saveBoard, saving, saveError };
}

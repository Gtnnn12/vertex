import { useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { useLanguage } from '../../contexts/LanguageContext';

interface ConfirmDeleteDialogProps {
  isOpen: boolean;
  /** Called only when the user confirms. */
  onConfirm: () => void;
  /** Called on reject / Escape / outside click — never deletes. */
  onReject: () => void;
}

/**
 * Confirmation dialog for destructive message deletion. Same glass surface,
 * radius and typography as the rest of the app's modals (shared `Modal`
 * component). Escape and outside click reject the action; only the red
 * "Confirmar" button deletes. Identical for DMs and server channels — the
 * caller is responsible for the actual deletion, so the real delete logic is
 * untouched.
 */
export function ConfirmDeleteDialog({ isOpen, onConfirm, onReject }: ConfirmDeleteDialogProps) {
  const { t } = useLanguage();

  // Escape rejects. (Outside click is already handled by the shared Modal's
  // backdrop `onClick={onClose}` — we wire that to reject below.)
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onReject();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onReject]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onReject}
      maxWidth="max-w-sm"
    >
      <div className="py-2">
        <div className="text-center">
          {/* Danger icon */}
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-txt-danger/25 bg-txt-danger/10">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="text-txt-danger">
              <path d="M9 3v1H4v2h16V4h-5V3H9zm-3 5v11a2 2 0 002 2h8a2 2 0 002-2V8H6zm3 2h2v8H9v-8zm4 0h2v8h-2v-8z" />
            </svg>
          </div>

          <h3 className="text-[16px] font-bold tracking-tight text-txt-primary">
            {t('delete_confirm_title')}
          </h3>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-txt-tertiary">
            {t('delete_confirm_desc')}
          </p>
        </div>

        <div className="mt-6 flex items-center gap-2.5">
          <button
            type="button"
            onClick={onReject}
            autoFocus
            className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[13px] font-semibold text-txt-secondary transition-all duration-150 hover:bg-white/[0.07] hover:text-txt-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
          >
            {t('delete_confirm_reject')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-lg border border-txt-danger/40 bg-txt-danger/90 px-4 py-2.5 text-[13px] font-bold text-white transition-all duration-150 hover:bg-txt-danger active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-txt-danger/50"
          >
            {t('delete_confirm_accept')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

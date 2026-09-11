import { useCallback } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import { Modal } from '../ui/Modal';
import { PersonalizationEditor, type PreviewState } from './PersonalizationEditor';
import { buildPreviewState } from './VERTEXAppPreview';
import { applyNetrexPersonalization } from '../../utils/netrexPersonalization';
import { useLanguage } from '../../contexts/LanguageContext';

const NETREX_PREFS_KEY = 'vertex.netrex.preferences';

function loadNetrexPrefs(): Partial<PreviewState> {
  try {
    const raw = localStorage.getItem(NETREX_PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveNetrexPrefs(prefs: Partial<PreviewState>): void {
  try {
    localStorage.setItem(NETREX_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // storage unavailable
  }
}

export function PersonalizationEditorModal() {
  const { t } = useLanguage();
  const activeModal = useUIStore((s) => s.activeModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const isNetrex = useAuthStore((s) => s.user?.netrexEnabled ?? false);
  const addToastFn = useUIStore((s) => s.addToast);

  const isOpen = activeModal === 'personalization';

  const handleClose = useCallback(() => {
    closeModal();
  }, [closeModal]);

  const handleSave = useCallback((state: PreviewState) => {
    if (!isNetrex) {
      // Show premium upsell
      useUIStore.getState().openModal('premiumBlock', {
        title: t('premium_block_title'),
        message: t('premium_block_message'),
        price: '4,99 €/mes',
      });
      return;
    }

    // 1) Persist the full editor state (exact colors, sliders, etc.).
    saveNetrexPrefs(state);

    // 2) Apply the state to the REAL app appearance — accent + effects go
    //    through the canonical vertexTheme pipeline (CSS variables on <html>,
    //    persisted under `vertex.preferences`, re-applied on every boot).
    applyNetrexPersonalization(state);

    // 3) Feedback: the UI is already re-skinned at this point.
    addToastFn(t('netrex_personalization_applied'), 'success', 2500);
    closeModal();
  }, [isNetrex, closeModal, addToastFn, t]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('personalize_vertex')}
      size="settings"
      mobileStyle="fullscreen"
    >
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        <PersonalizationEditor
          isNetrex={isNetrex}
          initialState={buildPreviewState(loadNetrexPrefs())}
          onSave={handleSave}
          onClose={handleClose}
        />
      </div>
    </Modal>
  );
}

import { useState, useEffect } from 'react';
import { isElectron } from '../../platform/platform';
import { useLanguage } from '../../contexts/LanguageContext';

type Phase =
  | { kind: 'downloading'; version: string }
  | { kind: 'downloaded'; version: string }
  | { kind: 'error'; message: string; releaseUrl: string };

/**
 * Update banner lifecycle (Electron only; renders nothing in the browser):
 * "update available" → background download → "restart to update".
 * Silent when there is no release. Errors offer the manual download link.
 */
export function UpdateToast() {
  const { t } = useLanguage();
  const [phase, setPhase] = useState<Phase | null>(null);

  useEffect(() => {
    if (!isElectron() || !window.backspace) return;

    window.backspace.onUpdateAvailable?.((info) => {
      setPhase({ kind: 'downloading', version: info.version });
    });

    window.backspace.onUpdateDownloaded((info) => {
      setPhase({ kind: 'downloaded', version: info.version });
    });

    window.backspace.onUpdateError((error) => {
      setPhase({ kind: 'error', message: error.message, releaseUrl: error.releaseUrl });
    });
  }, []);

  if (!phase) return null;

  const dismiss = () => setPhase(null);

  if (phase.kind === 'downloading') {
    return (
      <div className="fixed bottom-6 left-6 z-[300] animate-slide-up">
        <div className="glass-pill rounded-xl px-4 py-3 flex items-center gap-3 max-w-[340px]">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-txt-primary">{t('update_available_banner')}</p>
            <p className="text-xs text-txt-secondary truncate">
              {t('update_downloading').replace('{version}', phase.version)}
            </p>
          </div>
          <div className="shrink-0 h-1 w-16 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full w-1/3 rounded-full bg-accent-primary animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (phase.kind === 'downloaded') {
    return (
      <div className="fixed bottom-6 left-6 z-[300] animate-slide-up">
        <div className="glass-pill rounded-xl px-4 py-3 flex items-center gap-3 max-w-[340px]">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-txt-primary">{t('update_downloaded_banner')}</p>
            <p className="text-xs text-txt-secondary truncate">
              {t('update_downloaded_description').replace('{version}', phase.version)}
            </p>
          </div>
          <button
            onClick={() => window.backspace?.installUpdate()}
            className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent-primary hover:bg-accent-primary/80 text-white transition-colors"
          >
            {t('update_restart')}
          </button>
          <button
            onClick={dismiss}
            className="shrink-0 p-1 text-txt-tertiary hover:text-txt-secondary transition-colors"
            aria-label={t('update_dismiss')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // Download failed — manual download escape hatch
  return (
    <div className="fixed bottom-6 left-6 z-[300] animate-slide-up">
      <div className="glass-pill rounded-xl px-4 py-3 flex items-center gap-3 max-w-[380px]">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-txt-primary">{t('update_error_banner')}</p>
          <p className="text-xs text-txt-secondary truncate">
            {t('update_error_description')}
          </p>
        </div>
        <a
          href={phase.releaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent-primary hover:bg-accent-primary/80 text-white transition-colors"
        >
          {t('update_download')}
        </a>
        <button
          onClick={dismiss}
          className="shrink-0 p-1 text-txt-tertiary hover:text-txt-secondary transition-colors"
          aria-label={t('update_dismiss')}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

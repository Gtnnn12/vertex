import { useState, useEffect } from 'react';
import { isElectron } from '../../platform/platform';
import { useLanguage } from '../../contexts/LanguageContext';
import { UpdateNotesModal } from './UpdateNotesModal';
import { consumeUpgradedFromVersion } from '../../utils/lastSeenVersion';

interface UpdateError {
  message: string;
  releaseUrl: string;
}

/**
 * Persistent toast shown when an Electron auto-update has been downloaded
 * or when auto-update fails (offers manual download link).
 *
 * Also handles the "first run after update" flow: when the app starts with
 * a version newer than the last one seen, the What's New modal opens
 * automatically (once per version) and a small pill stays available to
 * reopen it. Renders nothing in browser environments.
 */
export function UpdateToast() {
  const { t } = useLanguage();
  const [downloadedVersion, setDownloadedVersion] = useState<string | null>(null);
  const [failedUpdate, setFailedUpdate] = useState<UpdateError | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  // Version we just upgraded to — enables the "What's new?" pill.
  const [updatedToVersion, setUpdatedToVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!isElectron() || !window.backspace) return;

    window.backspace.onUpdateDownloaded((info) => {
      setDownloadedVersion(info.version);
      // Auto-download succeeded — clear any previous error state
      setFailedUpdate(null);
    });

    window.backspace.onUpdateError((error) => {
      setFailedUpdate(error);
    });

    // First run after an update? Open the notes modal once and keep a
    // persistent affordance to reopen it for the rest of the session.
    let cancelled = false;
    window.backspace
      .getVersion()
      .then((currentVersion) => {
        if (cancelled || !currentVersion) return;
        const previous = consumeUpgradedFromVersion(currentVersion);
        if (previous) {
          setUpdatedToVersion(currentVersion);
          setShowNotes(true);
        }
      })
      .catch(() => {
        // Version unavailable — nothing to do.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const whatsNewPill =
    updatedToVersion && !downloadedVersion ? (
      <div className="fixed bottom-6 left-6 z-[300] animate-slide-up">
        <button
          onClick={() => setShowNotes(true)}
          className="glass-pill rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm font-medium text-txt-primary hover:bg-surface-hover transition-colors"
        >
          <span className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
          {t('update_whats_new')}
        </button>
      </div>
    ) : null;

  // Nothing to show
  if (!downloadedVersion && !failedUpdate && !whatsNewPill) return null;

  // Auto-download succeeded — show restart toast
  if (downloadedVersion) {
    return (
      <>
        <div className="fixed bottom-6 left-6 z-[300] animate-slide-up">
          <div className="glass-pill rounded-xl px-4 py-3 flex items-center gap-3 max-w-[340px]">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-txt-primary">{t('update_ready')}</p>
              <p className="text-xs text-txt-secondary truncate">
                {t('update_downloaded').replace('{version}', downloadedVersion)}
              </p>
            </div>
            <button
              onClick={() => setShowNotes(true)}
              className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-elevated hover:bg-surface-hover text-txt-primary transition-colors"
            >
              {t('update_whats_new')}
            </button>
            <button
              onClick={() => window.backspace?.installUpdate()}
              className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent-primary hover:bg-accent-primary/80 text-white transition-colors"
            >
              {t('update_toast_restart')}
            </button>
            <button
              onClick={() => setDownloadedVersion(null)}
              className="shrink-0 p-1 text-txt-tertiary hover:text-txt-secondary transition-colors"
              aria-label="Dismiss"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <UpdateNotesModal
          isOpen={showNotes}
          onClose={() => setShowNotes(false)}
          version={downloadedVersion}
          onInstall={() => {
            setShowNotes(false);
            window.backspace?.installUpdate();
          }}
        />
      </>
    );
  }

  // Auto-download failed — show manual download toast
  if (failedUpdate) {
    return (
      <div className="fixed bottom-6 left-6 z-[300] animate-slide-up">
        <div className="glass-pill rounded-xl px-4 py-3 flex items-center gap-3 max-w-[380px]">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-txt-primary">{t('update_failed')}</p>
            <p className="text-xs text-txt-secondary truncate">{t('update_failed_manual')}</p>
          </div>
          <a
            href={failedUpdate.releaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent-primary hover:bg-accent-primary/80 text-white transition-colors"
          >
            Download
          </a>
          <button
            onClick={() => setFailedUpdate(null)}
            className="shrink-0 p-1 text-txt-tertiary hover:text-txt-secondary transition-colors"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // Upgraded on a previous launch — reopenable What's New pill only.
  return (
    <>
      {whatsNewPill}
      <UpdateNotesModal
        isOpen={showNotes}
        onClose={() => setShowNotes(false)}
        version={updatedToVersion ?? ''}
        onInstall={() => setShowNotes(false)}
      />
    </>
  );
}

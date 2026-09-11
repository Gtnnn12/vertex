import { useTransferStore } from '../stores/transferStore';

export interface TransferAttachmentRef {
  attachmentId: string;
  filename: string;
}

const ATTACHMENT_WAIT_TIMEOUT_MS = 30_000;

/**
 * Wait for a transferStore upload to reach a terminal state.
 * Resolves with the server-assigned attachmentId + filename on success.
 * Rejects on failure, abort, or timeout.
 *
 * Handles the already-terminal case synchronously (resolves/rejects immediately
 * without subscribing) and unsubscribes after the first terminal observation.
 */
export function waitForTransferAttachment(transferId: string): Promise<TransferAttachmentRef> {
  console.log('[VERTEX AVATAR UPLOAD TRACE] waitForTransferAttachment called with:', transferId);
  return new Promise<TransferAttachmentRef>((resolve, reject) => {
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      console.error('[VERTEX AVATAR UPLOAD TRACE] TIMEOUT for transfer:', transferId);
      unsub();
      reject(new Error('Upload timed out'));
    }, ATTACHMENT_WAIT_TIMEOUT_MS);

    const check = (): boolean => {
      if (timedOut) return true;
      const t = useTransferStore.getState().transfers.get(transferId);
      if (!t) {
        console.log('[VERTEX AVATAR UPLOAD TRACE] Transfer not found:', transferId);
        return false;
      }
      console.log('[VERTEX AVATAR UPLOAD TRACE] Transfer state:', t.state, 'id:', transferId);
      if (t.state === 'completed' && t.attachmentId && t.attachmentFilename) {
        clearTimeout(timeoutId);
        console.log('[VERTEX AVATAR UPLOAD TRACE] RESOLVING with:', { attachmentId: t.attachmentId, filename: t.attachmentFilename });
        resolve({ attachmentId: t.attachmentId, filename: t.attachmentFilename });
        return true;
      }
      if (t.state === 'failed' || t.state === 'aborted') {
        clearTimeout(timeoutId);
        console.error('[VERTEX AVATAR UPLOAD TRACE] REJECTING with error:', t.error?.message);
        reject(new Error(t.error?.message ?? 'Upload failed'));
        return true;
      }
      return false;
    };

    if (check()) return;

    const unsub = useTransferStore.subscribe(() => {
      if (check()) unsub();
    });
  });
}

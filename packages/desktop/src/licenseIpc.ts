import { ipcMain, BrowserWindow, shell } from 'electron';

import {
  activarLicencia,
  checkStoredLicense,
  desactivarLicencia,
  type LicenseVerifyResult,
} from './services/license';
import { openCheckoutWindow, isCheckoutActive } from './checkout';
import { openBillingWindow } from './billing';
import { openCheckoutWindowUrl } from './checkout';
import { GUMROAD_PRODUCTS, isProductConfigured } from './config';

/**
 * Wire the purchase/license IPC surface:
 *
 *  - 'netrex-open-checkout'  → open the in-app Gumroad window; resolves true
 *    when the flow reported success, false on cancel/close. The renderer moves
 *    its modal to the "waiting" (key entry) state as soon as the window closes.
 *  - 'netrex-activate-license' → POST Gumroad verify + persist (encrypted).
 *  - 'netrex-check-license'  → startup re-verify with 7-day offline grace.
 *  - 'netrex-deactivate-license' → wipe the local encrypted blob.
 */
export function registerLicenseIpc(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle('netrex-open-checkout', async (_event, plan: unknown) => {
    const parent = getMainWindow();
    if (!parent) return { ok: false };
    const resolvedPlan = plan === 'sixMonths' ? 'sixMonths' : plan === 'yearly' ? 'yearly' : 'monthly';
    console.log('[buy main] (legacy) request plan=', resolvedPlan, 'url=', GUMROAD_PRODUCTS[resolvedPlan].url);
    const checkout = openCheckoutWindow(parent, resolvedPlan);
    const purchased = await checkout.done;
    return { ok: true, purchased };
  });

  ipcMain.handle('netrex-is-checkout-open', () => isCheckoutActive());

  // Which plans have a real checkout URL configured? The renderer disables
  // unconfigured plan buttons ("Próximamente") instead of failing on click.
  ipcMain.handle('netrex-plans-config', () =>
    (Object.keys(GUMROAD_PRODUCTS) as Array<keyof typeof GUMROAD_PRODUCTS>).map((plan) => ({
      plan,
      configured: isProductConfigured(plan),
    })),
  );

  // In-app Gumroad purchase library (change card, cancel the monthly plan).
  ipcMain.handle('netrex-open-billing', async () => {
    const parent = getMainWindow();
    if (!parent) return { ok: false };
    openBillingWindow(parent);
    return { ok: true };
  });

  // Checkout window with the account email pre-filled (?email=, best effort —
  // Gumroad honours it when the account allows it).
  ipcMain.handle('netrex-open-checkout-email', async (_e, plan: unknown, email: unknown) => {
    const parent = getMainWindow();
    const resolvedPlan = plan === 'sixMonths' ? 'sixMonths' : plan === 'yearly' ? 'yearly' : 'monthly';
    const productUrl = GUMROAD_PRODUCTS[resolvedPlan].url;
    console.log('[buy main] request plan=', resolvedPlan, 'url=', productUrl, 'hasMainWindow=', !!parent);

    // Never die silently: an unconfigured product or a missing main window is
    // reported back so the renderer can show a visible error instead.
    if (!productUrl || productUrl.includes('REEMPLAZAR')) {
      console.error('[buy main] ABORT — product URL not configured for plan', resolvedPlan);
      return { ok: false, error: 'missing_url' as const };
    }
    if (!parent) {
      console.error('[buy main] ABORT — main window not available');
      return { ok: false, error: 'no_window' as const };
    }

    const safeEmail = typeof email === 'string' && email.includes('@') ? encodeURIComponent(email) : null;
    const url = `${productUrl}${safeEmail ? `?email=${safeEmail}` : ''}`;
    try {
      const checkout = openCheckoutWindowUrl(parent, url);
      const purchased = await checkout.done;
      console.log('[buy main] checkout window closed, purchased=', purchased);
      return { ok: true, purchased };
    } catch (err) {
      // Guaranteed fallback: something visible ALWAYS happens — the OS browser.
      console.error('[buy main] in-app window failed, falling back to system browser:', err);
      if (productUrl.startsWith('https://')) void shell.openExternal(productUrl);
      return { ok: true, purchased: false, fallback: 'external' as const };
    }
  });

  // Open a URL in the OS browser (Gumroad purchase library, etc.). Only
  // https URLs are allowed through.
  ipcMain.handle('open-external-url', (_event, url: unknown) => {
    if (typeof url === 'string' && url.startsWith('https://')) {
      void shell.openExternal(url);
      return { ok: true };
    }
    return { ok: false };
  });

  ipcMain.handle(
    'netrex-activate-license',
    async (_event, key: unknown): Promise<LicenseVerifyResult> => {
      console.log('[license-ipc 3/3 main] handler entered, key type:', typeof key, 'len:', typeof key === 'string' ? key.length : 'n/a', '(this call crossed renderer→preload→IPC)');
      const result = await activarLicencia(typeof key === 'string' ? key : '');
      console.log('[license-ipc 3/3 main] activarLicencia result:', JSON.stringify(result));
      return result;
    },
  );

  ipcMain.handle('netrex-check-license', (): Promise<LicenseVerifyResult> => checkStoredLicense());

  ipcMain.handle('netrex-deactivate-license', () => {
    desactivarLicencia();
    return { ok: true };
  });
}

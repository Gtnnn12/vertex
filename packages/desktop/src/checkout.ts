import { BrowserWindow } from 'electron';

import { GUMROAD_PRODUCTS, type GumroadPlan } from './config';

/**
 * In-app Gumroad checkout.
 *
 * Opens the product page inside a modal child BrowserWindow (no system
 * browser). Popups (3D Secure / bank authentication) are re-parented as child
 * windows of the checkout window so they stay on top of the main window.
 *
 * Gumroad appends `?s=true` (success) / the session clears on cancel; we detect
 * both by URL inspection and close the window automatically, reporting the
 * outcome to the renderer.
 */

/** Ends with the Gumroad "thanks for buying" path or carries a success param.
 *  The product permalink itself is NOT a success — otherwise the window would
 *  self-close the moment it loads. Only explicit post-purchase signals count. */
function isSuccessUrl(url: string): boolean {
  try {
    const u = new URL(url);
    // Gumroad post-purchase lands on a different host or path: /thanks page,
    // success param, or the receipt/library. Loading the product page itself
    // (the permalink we opened) must never count as a purchase.
    if (u.searchParams.get('s') === 'true') return true;
    if (/\/l\/[\w-]+\/thanks/i.test(u.pathname)) return true;
    if (/\/(thanks|receipt|purchases)\b/i.test(u.pathname) && !isProductPermalink(u)) return true;
    return false;
  } catch {
    return false;
  }
}

/** True when the URL is exactly one of the configured product permalinks. */
function isProductPermalink(u: URL): boolean {
  return Object.values(GUMROAD_PRODUCTS).some((p) => {
    try {
      return u.host === new URL(p.url).host && u.pathname === new URL(p.url).pathname;
    } catch {
      return false;
    }
  });
}

function isCancelUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (!/gumroad\.com$/i.test(u.hostname)) return false;
    if (u.searchParams.get('c') === 'true') return true;
    if (u.pathname.includes('/cancel')) return true;
    return false;
  } catch {
    return false;
  }
}

export interface CheckoutHandle {
  /** Resolve with true when the flow detected success, false otherwise. */
  done: Promise<boolean>;
  close: () => void;
}

let activeCheckout: CheckoutHandle | null = null;

/** While a checkout is open, popups spawned from it become its child windows. */
export function isCheckoutActive(): boolean {
  return activeCheckout !== null;
}

export function openCheckoutWindow(parent: BrowserWindow, plan: GumroadPlan = 'monthly'): CheckoutHandle {
  return openCheckoutWindowUrl(parent, GUMROAD_PRODUCTS[plan].url);
}

/** Open the checkout flow at an arbitrary (already composed) Gumroad URL. */
export function openCheckoutWindowUrl(parent: BrowserWindow, url: string): CheckoutHandle {
  if (activeCheckout) return activeCheckout;

  let resolveDone!: (ok: boolean) => void;
  const done = new Promise<boolean>((resolve) => {
    resolveDone = resolve;
  });

  let closed = false;
  const finish = (ok: boolean) => {
    if (closed) return;
    closed = true;
    if (activeCheckout) {
      activeCheckout = null;
      resolveDone(ok);
    }
    if (!win.isDestroyed()) win.close();
  };

  const win = new BrowserWindow({
    width: 900,
    height: 760,
    parent,
    modal: process.platform !== 'darwin',
    title: 'Netrex — Pago seguro',
    backgroundColor: '#0a0a0a',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  activeCheckout = { done, close: () => finish(false) };
  const handle = activeCheckout;

  // 3D Secure popups: keep them inside the app as children of the checkout
  // window instead of opening a second top-level window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const child = new BrowserWindow({
        width: 520,
        height: 720,
        parent: win,
        modal: true,
        title: 'Autenticación',
        backgroundColor: '#0a0a0a',
        autoHideMenuBar: true,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
      });
      child.loadURL(url);
      return { action: 'deny' }; // we manage the child ourselves
    }
    return { action: 'deny' };
  });

  win.webContents.on('did-navigate', (_e, url) => {
    if (isSuccessUrl(url)) finish(true);
    else if (isCancelUrl(url)) finish(false);
  });

  win.once('ready-to-show', () => win.show());

  win.on('closed', () => {
    if (activeCheckout === handle) {
      activeCheckout = null;
      resolveDone(false); // user closed it manually — treat as cancel
    }
  });

  void win.loadURL(url);

  return handle;
}

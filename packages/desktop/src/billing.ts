import { BrowserWindow } from 'electron';

/**
 * In-app Gumroad purchase library (https://gumroad.com/library).
 *
 * A simple modal child window where the signed-in buyer sees their purchases,
 * can change the payment method and cancel the monthly subscription. Unlike
 * the checkout window there is no success/cancel detection — it is plain
 * account management; the user closes it when done.
 */

export function openBillingWindow(parent: BrowserWindow): BrowserWindow {
  const win = new BrowserWindow({
    width: 900,
    height: 760,
    parent,
    modal: process.platform !== 'darwin',
    title: 'Netrex — Gestión de pago',
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Keep any popups (Gumroad login, 3DS refresh) as children of this window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      const child = new BrowserWindow({
        width: 520,
        height: 720,
        parent: win,
        modal: true,
        autoHideMenuBar: true,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
      });
      child.loadURL(url);
      return { action: 'deny' };
    }
    return { action: 'deny' };
  });

  void win.loadURL('https://gumroad.com/library');
  return win;
}

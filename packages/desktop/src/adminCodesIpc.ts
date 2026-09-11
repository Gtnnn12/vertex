import { ipcMain } from 'electron';

import {
  setAdminAccessKey,
  checkAdminAccessKey,
  hasAdminAccessKey,
  setGumroadToken,
  hasGumroadToken,
  listOfferCodes,
  createOfferCode,
  deleteOfferCode,
} from './services/offerCodes';
import { GUMROAD_PRODUCTS } from './config';

/**
 * Owner-only IPC surface for the hidden discount-code admin panel.
 * Every offer-code handler re-checks the admin key (sent per-call from the
 * renderer) so a compromised renderer cannot touch Gumroad without it.
 */
export function registerAdminCodesIpc(): void {
  ipcMain.handle('admin-codes-setup-state', () => ({
    hasAdminKey: hasAdminAccessKey(),
    hasToken: hasGumroadToken(),
  }));

  ipcMain.handle('admin-codes-set-access-key', (_e, key: unknown) => {
    if (typeof key !== 'string') return { ok: false, error: 'bad_input' };
    const ok = setAdminAccessKey(key);
    return ok ? { ok: true } : { ok: false, error: 'too_short' };
  });

  ipcMain.handle('admin-codes-unlock', (_e, key: unknown) => {
    if (typeof key !== 'string') return { ok: false };
    return { ok: checkAdminAccessKey(key) };
  });

  ipcMain.handle('admin-codes-set-token', (_e, adminKey: unknown, token: unknown) => {
    if (!checkAdminAccessKey(String(adminKey ?? ''))) return { ok: false, error: 'unauthorized' };
    if (typeof token !== 'string') return { ok: false, error: 'bad_input' };
    const ok = setGumroadToken(token);
    return ok ? { ok: true } : { ok: false, error: 'too_short' };
  });

  ipcMain.handle('admin-codes-products', () =>
    Object.entries(GUMROAD_PRODUCTS).map(([plan, p]) => ({ plan, productId: p.productId, url: p.url })),
  );

  ipcMain.handle(
    'admin-codes-list',
    async (_e, adminKey: unknown, productId: unknown) => {
      if (!checkAdminAccessKey(String(adminKey ?? ''))) return { ok: false, error: 'unauthorized' };
      if (typeof productId !== 'string') return { ok: false, error: 'bad_input' };
      return listOfferCodes(productId);
    },
  );

  ipcMain.handle('admin-codes-create', async (_e, adminKey: unknown, input: unknown) => {
    if (!checkAdminAccessKey(String(adminKey ?? ''))) return { ok: false, error: 'unauthorized' };
    if (typeof input !== 'object' || input === null) return { ok: false, error: 'bad_input' };
    const i = input as Record<string, unknown>;
    return createOfferCode({
      productId: String(i.productId ?? ''),
      name: String(i.name ?? ''),
      code: String(i.code ?? ''),
      type: i.type === 'fixed' ? 'fixed' : 'percent',
      value: Number(i.value ?? 0),
      maxUses: typeof i.maxUses === 'number' && i.maxUses > 0 ? Math.round(i.maxUses) : null,
      startsAt: typeof i.startsAt === 'string' && i.startsAt ? i.startsAt : null,
      expiresAt: typeof i.expiresAt === 'string' && i.expiresAt ? i.expiresAt : null,
    });
  });

  ipcMain.handle('admin-codes-delete', async (_e, adminKey: unknown, productId: unknown, codeId: unknown) => {
    if (!checkAdminAccessKey(String(adminKey ?? ''))) return { ok: false, error: 'unauthorized' };
    if (typeof productId !== 'string' || typeof codeId !== 'string') return { ok: false, error: 'bad_input' };
    return deleteOfferCode(productId, codeId);
  });
}

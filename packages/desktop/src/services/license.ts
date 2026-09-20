import { safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';
import net from 'net';

import {
  GUMROAD_PRODUCTS,
  GUMROAD_VERIFY_URL,
  LICENSE_STORE_FILE,
  LICENSE_GRACE_DAYS,
  type GumroadPlan,
} from '../config';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Domain-level verification errors, mapped 1:1 to user-facing i18n keys. */
export type LicenseError =
  | 'invalid'
  | 'refunded'
  | 'uses_exceeded'
  | 'network'
  | 'server';

export type LicenseVerifyResult =
  | {
      ok: true;
      source: 'online' | 'cache';
      licenseKey: string;
      purchasedAt: number;
      /** Which Gumroad product the key belongs to. */
      plan: GumroadPlan;
    }
  | { ok: false; error: LicenseError };

interface StoredLicense {
  licenseKey: string;
  purchasedAt: number;
  /** Epoch ms of the last successful online verification. */
  lastVerifiedAt: number;
  /** Which plan the key activated ('monthly' | 'lifetime'). Older blobs lack it. */
  plan?: GumroadPlan;
}

/** Shape of Gumroad's POST /v2/licenses/verify response (subset we consume). */
interface GumroadVerifyResponse {
  success: boolean;
  purchase_refunded?: boolean;
  chargebacked?: boolean;
  uses?: number;
  uses_limit?: number | null;
}

// ─── Persistence (encrypted with electron.safeStorage) ──────────────────────

function storePath(): string {
  // Lazy import to avoid a hard dependency during module init order surprises.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { app } = require('electron') as typeof import('electron');
  return path.join(app.getPath('userData'), LICENSE_STORE_FILE);
}

function loadStoredLicense(): StoredLicense | null {
  try {
    const raw = fs.readFileSync(storePath());
    if (raw.length === 0) return null;
    // Blobs written before safeStorage was available (plaintext) are rejected.
    if (!safeStorage.isEncryptionAvailable()) return null;
    const plain = safeStorage.decryptString(raw);
    const parsed = JSON.parse(plain) as Partial<StoredLicense>;
    if (
      typeof parsed.licenseKey === 'string' &&
      parsed.licenseKey.length > 0 &&
      typeof parsed.lastVerifiedAt === 'number' &&
      typeof parsed.purchasedAt === 'number'
    ) {
      const legacyPlan = String(parsed.plan);
      const VALID_PLANS: GumroadPlan[] = ['monthly', 'sixMonths', 'yearly'];
      // Legacy blobs may carry 'six_months' (snake) or 'lifetime' → map/drop.
      const normalized = legacyPlan === 'six_months' ? 'sixMonths' : (legacyPlan as GumroadPlan);
      return {
        licenseKey: parsed.licenseKey,
        purchasedAt: parsed.purchasedAt,
        lastVerifiedAt: parsed.lastVerifiedAt,
        plan: VALID_PLANS.includes(normalized) ? normalized : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function saveStoredLicense(license: StoredLicense): void {
  try {
    if (!safeStorage.isEncryptionAvailable()) return; // fail-closed: don't store plaintext
    const plain = JSON.stringify(license);
    fs.writeFileSync(storePath(), safeStorage.encryptString(plain));
  } catch {
    // Persistence failure must not crash the app; activation still holds in
    // memory for the session.
  }
}

function clearStoredLicense(): void {
  try {
    fs.rmSync(storePath(), { force: true });
  } catch {
    // ignore
  }
}

// ─── Network probing ────────────────────────────────────────────────────────

/** True when we can open a TCP connection to the Gumroad API host. */
function hasNetwork(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: 'api.gumroad.com', port: 443 });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(4000);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

// ─── Verification ───────────────────────────────────────────────────────────

function errorFromGumroad(res: GumroadVerifyResponse): LicenseError {
  if (res.purchase_refunded || res.chargebacked) return 'refunded';
  if (
    typeof res.uses_limit === 'number' &&
    typeof res.uses === 'number' &&
    res.uses > res.uses_limit
  ) {
    return 'uses_exceeded';
  }
  return 'invalid';
}

/**
 * Verify a key against one Gumroad product. 'invalid' means the key does not
 * exist for that product — which is the fallback trigger, not a final error.
 */
async function verifyAgainstProduct(
  licenseKey: string,
  productId: string,
): Promise<LicenseVerifyResult | { ok: false; error: LicenseError; notFound?: true }> {
  let res: Response;
  try {
    res = await fetch(GUMROAD_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        product_id: productId,
        license_key: licenseKey,
        increment_uses_count: 'true',
      }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    // Log the REAL failure cause in the main process (ERR_NETWORK, DNS,
    // timeout, TLS…): otherwise activation failures are undiagnosable.
    console.error(
      `[license] verify POST failed for product ${productId}:`,
      err instanceof Error ? `${err.name}: ${err.message}` : err,
      // Node's fetch wraps causes — surface the chain too.
      err instanceof Error && (err as NodeJS.ErrnoException).cause
        ? `cause: ${(err as NodeJS.ErrnoException).cause}`
        : '',
    );
    return { ok: false, error: 'network' };
  }

  if (res.status === 404) return { ok: false, error: 'invalid', notFound: true };
  if (!res.ok) return { ok: false, error: 'server' };

  let body: GumroadVerifyResponse;
  try {
    body = (await res.json()) as GumroadVerifyResponse;
  } catch (err) {
    console.error(`[license] verify response not JSON (HTTP ${res.status}):`, err);
    return { ok: false, error: 'server' };
  }

  // Log the outcome either way — this is the evidence trail for activation.
  console.log(
    `[license] verify product=${productId} key=${licenseKey.slice(0, 4)}…` +
      ` http=${res.status} success=${body.success}` +
      (body.purchase_refunded ? ' refunded' : '') +
      (body.chargebacked ? ' chargebacked' : ''),
  );

  if (!body.success) return { ok: false, error: errorFromGumroad(body) };

  // Success sentinel — verifyOnline wraps it with key/plan/purchasedAt.
  return { ok: true, error: 'invalid' } as never;
}

function storedPurchasedAt(stored: StoredLicense | null): number {
  return stored?.purchasedAt ?? Date.now();
}

/**
 * Verify online against BOTH products: a key purchased for either plan must
 * activate Netrex. Try the stored plan first (fast path), then the other;
 * 'key not found' on one product falls through to the next before erroring.
 */
async function verifyOnline(licenseKey: string, preferredPlan?: GumroadPlan): Promise<LicenseVerifyResult> {
  // Gift keys can belong to any product — try the preferred one first, then
  // every other product until one accepts the key.
  const all: GumroadPlan[] = ['monthly', 'sixMonths', 'yearly'];
  const order: GumroadPlan[] = preferredPlan
    ? [preferredPlan, ...all.filter((p) => p !== preferredPlan)]
    : all;

  let lastError: LicenseError = 'invalid';
  let sawNetworkOrServer = false;

  for (const plan of order) {
    const result = await verifyAgainstProduct(licenseKey, GUMROAD_PRODUCTS[plan].productId);
    if (result.ok) {
      const stored = loadStoredLicense();
      saveStoredLicense({
        licenseKey,
        purchasedAt: storedPurchasedAt(stored),
        lastVerifiedAt: Date.now(),
        plan,
      });
      return {
        ok: true,
        source: 'online',
        licenseKey,
        purchasedAt: storedPurchasedAt(stored),
        plan,
      };
    }
    if (result.error !== 'invalid') sawNetworkOrServer = true;
    // 'key not found' for this product → try the next one. Real rejections
    // (refunded / uses_exceeded) and network/server errors stop the loop.
    if (!('notFound' in result && result.notFound)) {
      lastError = result.error;
      break;
    }
    lastError = 'invalid';
  }

  void sawNetworkOrServer;
  return { ok: false, error: lastError };
}

/**
 * Activate a license key: online verify against Gumroad, persist encrypted on
 * success. Returns a domain error usable for user-facing messaging.
 */
export async function activarLicencia(licenseKey: string): Promise<LicenseVerifyResult> {
  const key = licenseKey.trim().toUpperCase();
  if (!/^[0-9A-Z-]{6,64}$/.test(key)) return { ok: false, error: 'invalid' };
  return verifyOnline(key, loadStoredLicense()?.plan);
}

/**
 * Startup re-check: if a stored license exists, re-verify it online when the
 * network is reachable. Without network, the license stays trusted within the
 * 7-day grace period counted from the last successful verification; outside
 * the grace period the entitlement lapses (fail-closed) until the next online
 * check succeeds.
 */
export async function checkStoredLicense(): Promise<LicenseVerifyResult> {
  const stored = loadStoredLicense();
  if (!stored) return { ok: false, error: 'invalid' };

  if (await hasNetwork()) {
    const result = await verifyOnline(stored.licenseKey, stored.plan);
    if (result.ok || result.error !== 'network') {
      if (!result.ok) clearStoredLicense();
      return result;
    }
    // Network flapped mid-verify — fall through to the grace-period path.
  }

  const withinGrace =
    Date.now() - stored.lastVerifiedAt <= LICENSE_GRACE_DAYS * 24 * 60 * 60 * 1000;
  if (!withinGrace) {
    clearStoredLicense();
    return { ok: false, error: 'network' };
  }
  return {
    ok: true,
    source: 'cache',
    licenseKey: stored.licenseKey,
    purchasedAt: stored.purchasedAt,
    plan: stored.plan ?? 'monthly',
  };
}

/** Deactivate: wipe the local encrypted blob. */
export function desactivarLicencia(): void {
  clearStoredLicense();
}

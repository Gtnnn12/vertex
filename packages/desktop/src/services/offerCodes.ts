import { safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';

import { GUMROAD_PRODUCTS, type GumroadPlan } from '../config';

/**
 * Owner-only Gumroad offer-code management (runs in the Electron main
 * process). Secrets (admin access key + Gumroad API token) are persisted
 * encrypted with safeStorage inside userData — never hardcoded, never
 * committed.
 */

// ─── Secrets (safeStorage-encrypted files in userData) ──────────────────────

const ADMIN_KEY_FILE = 'netrex-admin-key.bin';
const GUMROAD_TOKEN_FILE = 'netrex-gumroad-token.bin';
const GUMROAD_API = 'https://api.gumroad.com/v2';

function secretPath(file: string): string {
  const { app } = require('electron') as typeof import('electron');
  return path.join(app.getPath('userData'), file);
}

function readSecret(file: string): string | null {
  try {
    const raw = fs.readFileSync(secretPath(file));
    if (raw.length === 0) return null;
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(raw);
  } catch {
    return null;
  }
}

function writeSecret(file: string, value: string): boolean {
  try {
    if (!safeStorage.isEncryptionAvailable()) return false; // fail-closed
    fs.writeFileSync(secretPath(file), safeStorage.encryptString(value));
    return true;
  } catch {
    return false;
  }
}

export function setAdminAccessKey(key: string): boolean {
  const trimmed = key.trim();
  if (trimmed.length < 8) return false;
  return writeSecret(ADMIN_KEY_FILE, trimmed);
}

export function checkAdminAccessKey(key: string): boolean {
  const stored = readSecret(ADMIN_KEY_FILE);
  return stored !== null && stored === key.trim();
}

export function hasAdminAccessKey(): boolean {
  return readSecret(ADMIN_KEY_FILE) !== null;
}

export function setGumroadToken(token: string): boolean {
  const trimmed = token.trim();
  if (trimmed.length < 10) return false;
  return writeSecret(GUMROAD_TOKEN_FILE, trimmed);
}

export function hasGumroadToken(): boolean {
  return readSecret(GUMROAD_TOKEN_FILE) !== null;
}

// ─── Gumroad offer-codes API (main process only) ────────────────────────────

export interface OfferCode {
  id: string;
  name: string;
  code: string;
  /** 'percent' | 'fixed' — Gumroad's offer_code "duration" fork. */
  type: 'percent' | 'fixed';
  /** 0-100 for percent; absolute cents amount for fixed. */
  amount: number;
  universal: boolean;
  timesUsed: number;
  maxUses: number | null;
  startsAt: string | null;
  expiresAt: string | null;
}

interface GumroadOfferCodeApi {
  id: string;
  name: string;
  code: string;
  duration?: string;
  amount_off?: number;
  percent_off?: number;
  universal?: boolean;
  times_used?: number;
  max_charges?: number | null;
  starts_at?: string | null;
  expires_at?: string | null;
}

function mapOfferCode(raw: GumroadOfferCodeApi): OfferCode {
  return {
    id: raw.id,
    name: raw.name,
    code: raw.code,
    type: raw.duration === 'fixed' ? 'fixed' : 'percent',
    amount: raw.duration === 'fixed' ? (raw.amount_off ?? 0) : (raw.percent_off ?? 0),
    universal: raw.universal ?? false,
    timesUsed: raw.times_used ?? 0,
    maxUses: raw.max_charges ?? null,
    startsAt: raw.starts_at ?? null,
    expiresAt: raw.expires_at ?? null,
  };
}

/** Auth body shared by every Gumroad API call. */
function authParams(): URLSearchParams | null {
  const token = readSecret(GUMROAD_TOKEN_FILE);
  if (!token) return null;
  return new URLSearchParams({ access_token: token });
}

async function gumroadFetch(
  url: string,
  init: RequestInit & { body?: URLSearchParams },
): Promise<{ ok: boolean; status: number; body: unknown }> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: { error: 'network' } };
  }
}

function planForProductId(productId: string): GumroadPlan | null {
  for (const [plan, p] of Object.entries(GUMROAD_PRODUCTS)) {
    if (p.productId === productId) return plan as GumroadPlan;
  }
  return null;
}

export async function listOfferCodes(
  productId: string,
): Promise<{ ok: true; codes: OfferCode[]; plan: GumroadPlan | null } | { ok: false; error: string }> {
  const auth = authParams();
  if (!auth) return { ok: false, error: 'token_missing' };
  const res = await gumroadFetch(
    `${GUMROAD_API}/products/${encodeURIComponent(productId)}/offer_codes?${auth.toString()}`,
    { method: 'GET' },
  );
  if (!res.ok) {
    const err = (res.body as { error?: string; message?: string }) ?? {};
    return { ok: false, error: err.message ?? err.error ?? `http_${res.status}` };
  }
  const codes = ((res.body as { offer_codes?: GumroadOfferCodeApi[] }).offer_codes ?? []).map(mapOfferCode);
  return { ok: true, codes, plan: planForProductId(productId) };
}

export interface CreateOfferCodeInput {
  productId: string;
  name: string;
  code: string;
  type: 'percent' | 'fixed';
  /** 0-100 for percent; euros with decimals for fixed. */
  value: number;
  maxUses?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
}

const CODE_REGEX = /^[A-Za-z0-9_-]+$/;

export async function createOfferCode(
  input: CreateOfferCodeInput,
): Promise<{ ok: true; code: OfferCode } | { ok: false; error: string }> {
  const auth = authParams();
  if (!auth) return { ok: false, error: 'token_missing' };
  if (!CODE_REGEX.test(input.code)) return { ok: false, error: 'code_invalid' };

  const params = auth;
  params.set('name', input.name.trim());
  params.set('code', input.code.trim());
  if (input.type === 'percent') {
    params.set('duration', 'percent');
    params.set('percent_off', String(Math.round(input.value)));
  } else {
    params.set('duration', 'fixed');
    params.set('amount_off', String(Math.round(input.value * 100))); // cents
  }
  if (typeof input.maxUses === 'number' && input.maxUses > 0) {
    params.set('max_charges', String(input.maxUses));
  }
  if (input.startsAt) params.set('starts_at', input.startsAt);
  if (input.expiresAt) params.set('expires_at', input.expiresAt);

  const res = await gumroadFetch(
    `${GUMROAD_API}/products/${encodeURIComponent(input.productId)}/offer_codes`,
    { method: 'POST', body: params },
  );
  if (!res.ok) {
    const err = (res.body as { error?: string; message?: string }) ?? {};
    return { ok: false, error: err.message ?? err.error ?? `http_${res.status}` };
  }
  const raw = (res.body as { offer_code?: GumroadOfferCodeApi }).offer_code;
  if (!raw) return { ok: false, error: 'unexpected_response' };
  return { ok: true, code: mapOfferCode(raw) };
}

export async function deleteOfferCode(
  productId: string,
  codeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = authParams();
  if (!auth) return { ok: false, error: 'token_missing' };
  const res = await gumroadFetch(
    `${GUMROAD_API}/products/${encodeURIComponent(productId)}/offer_codes/${encodeURIComponent(codeId)}?${auth.toString()}`,
    { method: 'DELETE' },
  );
  if (!res.ok) {
    const err = (res.body as { error?: string; message?: string }) ?? {};
    return { ok: false, error: err.message ?? err.error ?? `http_${res.status}` };
  }
  return { ok: true };
}

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useAuthStore } from './authStore';
import { api } from '../api/client';

/** Raw fetch against the backend with the session token (netrex endpoints). */
async function netrexFetch<T>(path: string): Promise<T> {
  const token = useAuthStore.getState().token;
  const res = await fetch(`/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`http_${res.status}`);
  return (await res.json()) as T;
}

export type NetrexSubscriptionPlan = 'monthly' | 'six_months' | 'yearly';

interface ServerEntitlement {
  plan: NetrexSubscriptionPlan | null;
  until: number | null;
  active: boolean;
}

/**
 * Pull the server-side entitlement (Gumroad ping already processed) and merge
 * it into the local store. Called at app boot and after the checkout window
 * closes. Network/token errors leave the local state untouched.
 */
export async function refreshNetrexEntitlement(): Promise<ServerEntitlement | null> {
  try {
    const ent = await netrexFetch<ServerEntitlement>('/netrex/entitlement');
    if (ent.active && ent.plan) {
      const plan = ent.plan === 'six_months' ? 'sixMonths' : ent.plan;
      useNetrexLicenseStore.getState().activateServer(plan, ent.until);
      return ent;
    }
    return ent;
  } catch {
    return null;
  }
}

/**
 * App-level Netrex tier, driven by the real Gumroad license verification that
 * runs in the Electron main process (`activateNetrexLicense`). The backend
 * entitlement (`user.netrexEnabled`) stays authoritative for server features;
 * this store records that the desktop install holds a verified license and
 * unlocks the client-side premium UI alongside it.
 */
export type NetrexPlan = 'monthly' | 'sixMonths' | 'yearly' | 'lifetime';

interface NetrexLicenseState {
  licenseKey: string | null;
  purchasedAt: number | null;
  lastVerifiedAt: number | null;
  /** Which plan the verified key belongs to. */
  plan: NetrexPlan | null;
  /** Server-confirmed entitlement end (epoch ms) from /netrex/entitlement. */
  serverUntil: number | null;
  activate: (licenseKey: string, purchasedAt?: number, plan?: NetrexPlan) => void;
  /** Server-side (webhook) entitlement — no local key involved. */
  activateServer: (plan: NetrexPlan, until: number | null) => void;
  markVerified: () => void;
  clear: () => void;
}

export const useNetrexLicenseStore = create<NetrexLicenseState>()(
  persist(
    (set) => ({
      licenseKey: null,
      purchasedAt: null,
      lastVerifiedAt: null,
      plan: null,
      serverUntil: null,
      activate: (licenseKey, purchasedAt = Date.now(), plan?) =>
        set({ licenseKey, purchasedAt, lastVerifiedAt: Date.now(), plan: plan ?? null }),
      activateServer: (plan, until) =>
        set({ licenseKey: 'SERVER', plan, serverUntil: until, lastVerifiedAt: Date.now(), purchasedAt: Date.now() }),
      markVerified: () => set({ lastVerifiedAt: Date.now() }),
      clear: () => set({ licenseKey: null, purchasedAt: null, lastVerifiedAt: null, plan: null, serverUntil: null }),
    }),
    {
      name: 'vertex.netrex.license.v1',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/**
 * Unified entitlement check: backend-granted Netrex OR a locally verified
 * Gumroad license. Safe to call outside React (stores, event handlers).
 */
export function isNetrexEntitled(): boolean {
  if (useAuthStore.getState().user?.netrexEnabled === true) return true;
  return useNetrexLicenseStore.getState().licenseKey !== null;
}

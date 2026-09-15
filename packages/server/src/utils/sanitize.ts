import type { User, ReplicatedInstance, StaffRole, MusicWidgetStyle, BoardWidget } from '@vertex/shared';
import { MUSIC_WIDGET_STYLES, BOARD_WIDGET_TYPES, MAX_BOARD_WIDGETS } from '@vertex/shared';
import { STAFF_ROLES } from '@vertex/shared';
import { schema } from '../db/index.js';

const STAFF_ROLE_SET = new Set<string>(STAFF_ROLES);

const BOARD_TYPE_SET = new Set<string>(BOARD_WIDGET_TYPES);

/**
 * Defensive parse of the stored board JSON. The write path already validates
 * everything; this read path only guards against hand-edited/corrupt rows so
 * the client can trust the shape without a second validation pass.
 */
function sanitizeBoard(raw: string | null | undefined): BoardWidget[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: BoardWidget[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const w = item as Record<string, unknown>;
      if (typeof w.id !== 'string' || !BOARD_TYPE_SET.has(w.type as string)) continue;
      if (out.length >= MAX_BOARD_WIDGETS) break;
      out.push({
        id: w.id,
        type: w.type as BoardWidget['type'],
        visible: w.visible !== false,
        config: (w.config && typeof w.config === 'object' ? w.config : {}) as Record<string, unknown>,
      });
    }
    return out;
  } catch {
    return [];
  }
}

function toStaffRole(value: string | null | undefined): StaffRole | null {
  return value && STAFF_ROLE_SET.has(value) ? (value as StaffRole) : null;
}

export function sanitizeUser(row: typeof schema.users.$inferSelect, isSelf = false): User {
  // Tombstoned (deleted) users — return anonymized profile
  if (row.isDeleted === 1) {
    return {
      id: row.id,
      username: 'Deleted User',
      displayName: null,
      avatar: null,
      banner: null,
      accentColor: null,
      avatarColor: null,
      bio: null,
      status: 'offline',
      customStatus: null,
      isAdmin: false,
      netrexEnabled: false,
      netrexExpiresAt: null,
      staffRole: null,
      isDeleted: true,
      discoverable: false,
      profileUpdatedAt: 0,
      createdAt: row.createdAt,
      homeInstance: null,
      homeUserId: null,      replicatedInstances: [],
    ...(isSelf ? { showActivity: false } : {}),
    musicWidgetStyle: 'vinyl',
    profileBoard: [],
    profileAccent: null,
  };
  }

  let replicatedInstances: ReplicatedInstance[] = [];
  if (row.replicatedInstances) {
    try {
      replicatedInstances = JSON.parse(row.replicatedInstances);
    } catch {
      replicatedInstances = [];
    }
  }

  const netrexGranted = row.isAdmin === 1 && process.env.NODE_ENV !== 'production'
    ? true
    : row.netrexEnabled === 1;

  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    avatar: row.avatar,
    banner: row.banner ?? null,
    accentColor: row.accentColor ?? null,
    avatarColor: (row.avatarColor as User['avatarColor']) ?? null,
    bio: row.bio ?? null,
    status: (row.status ?? 'offline') as User['status'],
    customStatus: row.customStatus,
    isAdmin: row.isAdmin === 1,
    netrexEnabled: netrexGranted && (row.netrexExpiresAt == null || row.netrexExpiresAt > Date.now()),
    netrexExpiresAt: row.netrexExpiresAt ?? null,
    staffRole: toStaffRole(row.staffRole),
    discoverable: row.discoverable !== 0,
    profileUpdatedAt: row.profileUpdatedAt ?? 0,
    createdAt: row.createdAt,
    homeInstance: row.homeInstance ?? null,
    homeUserId: row.homeUserId ?? null,
    replicatedInstances,
    ...(isSelf
      ? {
          showActivity: row.showActivity !== 0,
          federationHomeOrphaned: row.federationHomeOrphaned === 1,
        }
      : {}),
    // Music-card style: the stored value is already Netrex-validated at write
    // time. If the entitlement has since lapsed, fall back to the free vinyl
    // style — the client can rely on this field without a second entitlement
    // check.
    musicWidgetStyle: MUSIC_WIDGET_STYLES.includes(row.musicWidgetStyle as MusicWidgetStyle)
      ? (row.musicWidgetStyle as MusicWidgetStyle)
      : 'vinyl',
    // Profile board (Tablero). Visible to EVERYONE — it's the Netrex
    // showcase; only EDITING is entitlement-gated (server-side, on save).
    profileBoard: sanitizeBoard(row.profileBoard),
    // Personal profile tint. Stored value is hex-validated at write time.
    profileAccent: row.profileAccent ?? null,
  };
}

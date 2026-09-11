import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { and, asc, count, desc, eq, gte, gt, inArray, isNotNull, isNull, like, lte, ne, notInArray, or, sql } from 'drizzle-orm';
import {
  STAFF_RANK,
  STAFF_ROLES,
  type AdminCenterActivityResponse,
  type AdminCenterActivityRow,
  type AdminCenterSpaceDetail,
  type AdminCenterSpaceRow,
  type AdminCenterSpacesResponse,
  type AdminCenterSummary,
  type AdminCenterUserDetail,
  type AdminCenterUserRow,
  type AdminCenterUsersResponse,
  type AuditLogEntry,
  type AuditLogResponse,
  type ModerationAction,
  type ModerationEvent,
  type ModerationResult,
  type NetrexState,
  type NetrexStatusResult,
  type StaffAssignResult,
  type StaffMember,
  type StaffRole,
} from '@backspace/shared';
import { authenticate } from '../utils/auth.js';
import {
  STAFF_BAN_MIN_RANK,
  STAFF_MANAGE_NETREX_MIN_RANK,
  STAFF_MANAGE_STAFF_MIN_RANK,
  STAFF_MODERATE_MIN_RANK,
  isStaffRole,
  requireStaff,
  requireStaffRank,
  resolveStaffIdentity,
  type StaffIdentity,
} from '../utils/staffAuth.js';
import { getDb, schema } from '../db/index.js';
import { sanitizeUser } from '../utils/sanitize.js';
import { writeAuditLog } from '../utils/audit.js';
import { connectionManager } from '../ws/handler.js';
import { collectProfileBroadcastTargetIds } from '../utils/userDeletion.js';

const PERMANENT_BAN_UNTIL = 253402300799999;
const MAX_GRANT_MINUTES = 525600;
const MAX_TIMEOUT_HOURS = 720;
const MAX_REASON_LENGTH = 1000;
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

interface ListQuery {
  q?: string;
  filter?: string;
  presence?: string;
  sort?: string;
  visibility?: string;
  page?: string;
  pageSize?: string;
  action?: string;
  actor?: string;
  from?: string;
  to?: string;
}

function computeNetrexState(row: (typeof schema.users)['$inferSelect']): NetrexState {
  const expiresAt = row.netrexExpiresAt ?? null;
  if (row.netrexEnabled === 1) {
    if (expiresAt == null) return 'permanent';
    return expiresAt > Date.now() ? 'active' : 'expired';
  }
  if (expiresAt != null && expiresAt <= Date.now()) return 'expired';
  return 'none';
}

function toAdminCenterUserRow(row: (typeof schema.users)['$inferSelect']): AdminCenterUserRow {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    avatar: row.avatar,
    avatarColor: row.avatarColor,
    status: row.status ?? 'offline',
    isAdmin: row.isAdmin === 1,
    isDeleted: row.isDeleted === 1,
    homeInstance: row.homeInstance,
    createdAt: row.createdAt,
    netrexState: computeNetrexState(row),
    netrexExpiresAt: row.netrexExpiresAt ?? null,
    staffRole: isStaffRole(row.staffRole) ? row.staffRole : null,
    bannedUntil: row.bannedUntil ?? null,
    banReason: row.banReason ?? null,
    lastSeenAt: row.lastSeenAt ?? null,
  };
}

function targetRankViolation(actor: StaffIdentity, targetRow: (typeof schema.users)['$inferSelect']): boolean {
  const targetIdentity = resolveStaffIdentity(targetRow.id);
  if (!targetIdentity) return false;
  if (actor.role === 'owner') return false;
  return targetIdentity.rank >= actor.rank;
}

function simulateGuardrails(targetUserId: string, nextRole: StaffRole | null): { owners: number; admins: number } {
  const db = getDb();
  const users = db.select({
    id: schema.users.id,
    staffRole: schema.users.staffRole,
    isAdmin: schema.users.isAdmin,
  }).from(schema.users).where(eq(schema.users.isDeleted, 0)).all();

  let owners = 0;
  let admins = 0;
  for (const u of users) {
    const role = u.id === targetUserId ? nextRole : (isStaffRole(u.staffRole) ? u.staffRole : null);
    if (role === 'owner') owners += 1;
    const rank = role ? STAFF_RANK[role] : (u.isAdmin === 1 ? STAFF_RANK.administrator : 0);
    if (rank >= STAFF_MANAGE_STAFF_MIN_RANK) admins += 1;
  }
  return { owners, admins };
}

function guardrailError(targetRow: (typeof schema.users)['$inferSelect'], nextRole: StaffRole | null): string | null {
  if (nextRole === null || nextRole !== (isStaffRole(targetRow.staffRole) ? targetRow.staffRole : null)) {
    const { owners, admins } = simulateGuardrails(targetRow.id, nextRole);
    if (admins === 0) return 'At least one administrator must remain';

    // The owner guardrail protects an EXISTING owner — removing the last owner
    // is always rejected. But on a fresh instance no staffRole='owner' row
    // exists yet, so requiring one before any promotion never fires would
    // deadlock the staff bootstrap: the first owner can never be appointed.
    // Only block when the change would drop owners from a non-zero count to zero.
    const becomesOwner = nextRole === 'owner';
    const isCurrentlyOwner = (isStaffRole(targetRow.staffRole) ? targetRow.staffRole : null) === 'owner';
    const ownersBefore = owners - (becomesOwner ? 1 : isCurrentlyOwner ? -1 : 0);
    if (owners === 0 && ownersBefore > 0) return 'At least one owner must remain';
  }
  return null;
}

function staffChangeViolation(
  actor: StaffIdentity,
  targetRow: (typeof schema.users)['$inferSelect'],
  nextRole: StaffRole | null,
): string | null {
  const currentRole = isStaffRole(targetRow.staffRole)
    ? targetRow.staffRole
    : (targetRow.isAdmin === 1 ? 'administrator' as StaffRole : null);
  const nextRank = nextRole ? STAFF_RANK[nextRole] : 0;
  const currentRank = currentRole ? STAFF_RANK[currentRole] : (targetRow.isAdmin === 1 ? STAFF_RANK.administrator : 0);

  if (targetRow.id === actor.userId) {
    if (nextRank > currentRank) return 'You cannot promote yourself';
    const guardrail = guardrailError(targetRow, nextRole);
    if (guardrail) return guardrail;
    return null;
  }

  if (currentRank >= actor.rank && actor.role !== 'owner') {
    return 'You cannot change the role of staff at or above your rank';
  }
  if (nextRole === 'owner' && actor.role !== 'owner') {
    return 'Only the owner can assign the owner role';
  }
  const guardrail = guardrailError(targetRow, nextRole);
  if (guardrail) return guardrail;
  return null;
}

function getUserOrNull(userId: string) {
  return getDb().select().from(schema.users).where(eq(schema.users.id, userId)).get() ?? null;
}

function parsePagination(pageRaw: unknown, pageSizeRaw: unknown): { page: number; pageSize: number } {
  const page = Math.max(1, parseInt(String(pageRaw ?? '1'), 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(String(pageSizeRaw ?? String(DEFAULT_PAGE_SIZE)), 10) || DEFAULT_PAGE_SIZE));
  return { page, pageSize };
}

function broadcastUserUpdated(userId: string): void {
  const row = getUserOrNull(userId);
  if (!row) return;
  const event = { type: 'user_updated' as const, user: sanitizeUser(row) };
  connectionManager.sendToUser(userId, event);
  for (const uid of collectProfileBroadcastTargetIds(userId)) {
    connectionManager.sendToUser(uid, event);
  }
}

export async function adminCenterRoutes(app: FastifyInstance): Promise<void> {
  // ─── Overview ─────────────────────────────────────────────────────────────

  app.get('/api/admin-center/summary', { preHandler: [authenticate, requireStaff] }, async (request, reply) => {
    try {
      const identity = resolveStaffIdentity(request.userId)!;
      const db = getDb();
      const now = Date.now();

      const totalUsers = db.select({ n: count() }).from(schema.users).where(eq(schema.users.isDeleted, 0)).get()?.n ?? 0;
      const onlineUsers = connectionManager.getAllOnlineUserIds().length;
      const day7 = now - 7 * 86400000;
      const day30 = now - 30 * 86400000;
      const newUsers7d = db.select({ n: count() }).from(schema.users).where(and(eq(schema.users.isDeleted, 0), gte(schema.users.createdAt, day7))).get()?.n ?? 0;
      const newUsers30d = db.select({ n: count() }).from(schema.users).where(and(eq(schema.users.isDeleted, 0), gte(schema.users.createdAt, day30))).get()?.n ?? 0;
      const netrexActive = db.select({ n: count() }).from(schema.users).where(and(eq(schema.users.isDeleted, 0), eq(schema.users.netrexEnabled, 1))).get()?.n ?? 0;
      const netrexPermanent = db.select({ n: count() }).from(schema.users).where(and(eq(schema.users.isDeleted, 0), eq(schema.users.netrexEnabled, 1), isNull(schema.users.netrexExpiresAt))).get()?.n ?? 0;

      const allUsers = db.select({
        staffRole: schema.users.staffRole,
        isAdmin: schema.users.isAdmin,
      }).from(schema.users).where(eq(schema.users.isDeleted, 0)).all();
      const staffCount = allUsers.filter(u => u.isAdmin === 1 || isStaffRole(u.staffRole)).length;

      const bannedUsers = db.select({ n: count() }).from(schema.users)
        .where(and(eq(schema.users.isDeleted, 0), isNotNull(schema.users.bannedUntil), gt(schema.users.bannedUntil, now)))
        .get()?.n ?? 0;
      const spacesCount = db.select({ n: count() }).from(schema.spaces).get()?.n ?? 0;

      const summary: AdminCenterSummary = {
        totalUsers,
        onlineUsers,
        newUsers7d,
        newUsers30d,
        netrexActive,
        netrexPermanent,
        staffCount,
        bannedUsers,
        spacesCount,
        viewer: {
          userId: identity.userId,
          role: identity.role,
          rank: identity.rank,
          canManageNetrex: identity.rank >= STAFF_MANAGE_NETREX_MIN_RANK,
          canManageStaff: identity.rank >= STAFF_MANAGE_STAFF_MIN_RANK,
          canModerate: identity.rank >= STAFF_MODERATE_MIN_RANK,
          canBan: identity.rank >= STAFF_BAN_MIN_RANK,
        },
      };
      return reply.code(200).send(summary);
    } catch (err: any) {
      return reply.code(500).send({ error: `Failed to load summary: ${err.message}`, statusCode: 500 });
    }
  });

  // ─── Users ────────────────────────────────────────────────────────────────

  app.get<{ Querystring: ListQuery }>(
    '/api/admin-center/users',
    { preHandler: [authenticate, requireStaff] },
    async (request, reply) => {
      try {
        const db = getDb();
        const now = Date.now();
        const { page, pageSize } = parsePagination(request.query.page, request.query.pageSize);
        const q = String(request.query.q ?? '').trim();
        const filter = String(request.query.filter ?? 'active');
        const presence = String(request.query.presence ?? '');
        const sort = String(request.query.sort ?? 'newest');

        const conditions: any[] = [];
        let excludeDeleted = true;
        if (filter === 'all') excludeDeleted = false;
        if (excludeDeleted) conditions.push(eq(schema.users.isDeleted, 0));
        if (filter === 'deleted') conditions.push(eq(schema.users.isDeleted, 1));

        if (q) {
          const pattern = `%${q}%`;
          conditions.push(or(
            like(schema.users.username, pattern),
            like(schema.users.displayName, pattern),
            like(schema.users.id, pattern),
          )!);
        }

        switch (filter) {
          case 'netrex':
            conditions.push(eq(schema.users.netrexEnabled, 1));
            break;
          case 'expired':
            conditions.push(and(eq(schema.users.netrexEnabled, 0), isNotNull(schema.users.netrexExpiresAt)));
            break;
          case 'no-netrex':
            conditions.push(and(eq(schema.users.netrexEnabled, 0), isNull(schema.users.netrexExpiresAt)));
            break;
          case 'staff':
            conditions.push(or(isNotNull(schema.users.staffRole), eq(schema.users.isAdmin, 1))!);
            break;
          case 'no-staff':
            conditions.push(and(isNull(schema.users.staffRole), eq(schema.users.isAdmin, 0)));
            break;
          case 'banned':
            conditions.push(and(isNotNull(schema.users.bannedUntil), gt(schema.users.bannedUntil, now)));
            break;
          case 'not-banned':
            conditions.push(or(isNull(schema.users.bannedUntil), lte(schema.users.bannedUntil, now))!);
            break;
          default:
            break;
        }

        if (presence === 'online' || presence === 'offline') {
          const onlineIds = connectionManager.getAllOnlineUserIds();
          if (presence === 'online') {
            if (onlineIds.length === 0) {
              return reply.code(200).send({ users: [], total: 0, page, pageSize });
            }
            conditions.push(inArray(schema.users.id, onlineIds));
          } else {
            if (onlineIds.length === 0) {
              conditions.push(eq(schema.users.isDeleted, -1));
            } else {
              conditions.push(notInArray(schema.users.id, onlineIds));
            }
          }
        }

        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const total = db.select({ n: count() }).from(schema.users).where(where).get()?.n ?? 0;

        let orderBy: any;
        switch (sort) {
          case 'oldest': orderBy = asc(schema.users.createdAt); break;
          case 'az': orderBy = asc(schema.users.username); break;
          case 'za': orderBy = desc(schema.users.username); break;
          case 'lastActive': orderBy = desc(schema.users.lastSeenAt); break;
          default: orderBy = desc(schema.users.createdAt); break;
        }

        const rows = db.select().from(schema.users)
          .where(where)
          .orderBy(orderBy)
          .limit(pageSize)
          .offset((page - 1) * pageSize)
          .all();

        const response: AdminCenterUsersResponse = {
          users: rows.map(toAdminCenterUserRow),
          total,
          page,
          pageSize,
        };
        return reply.code(200).send(response);
      } catch (err: any) {
        return reply.code(500).send({ error: `Failed to list users: ${err.message}`, statusCode: 500 });
      }
    },
  );

  app.get(
    '/api/admin-center/users/:id',
    { preHandler: [authenticate, requireStaff] },
    async (request, reply) => {
      try {
        const db = getDb();
        const { id } = request.params as { id: string };
        const target = db.select().from(schema.users).where(eq(schema.users.id, id)).get();
        if (!target) {
          return reply.code(404).send({ error: 'User not found', statusCode: 404 });
        }

        const ownedSpaces = db.select().from(schema.spaces).where(eq(schema.spaces.ownerId, target.id)).all();
        const memberRows = db.select({ spaceId: schema.spaceMembers.spaceId, joinedAt: schema.spaceMembers.joinedAt })
          .from(schema.spaceMembers)
          .where(eq(schema.spaceMembers.userId, target.id))
          .all();

        const spaceIds = Array.from(new Set([...ownedSpaces.map(s => s.id), ...memberRows.map(m => m.spaceId)]));
        const counts = new Map<string, number>();
        if (spaceIds.length > 0) {
          const countRows = db.select({ spaceId: schema.spaceMembers.spaceId, n: count() })
            .from(schema.spaceMembers)
            .where(inArray(schema.spaceMembers.spaceId, spaceIds))
            .groupBy(schema.spaceMembers.spaceId)
            .all();
          for (const c of countRows) counts.set(c.spaceId, c.n ?? 0);
        }

        const owned = ownedSpaces.map(s => ({
          id: s.id,
          name: s.name,
          icon: s.icon,
          avatarColor: s.avatarColor,
          visibility: s.visibility ?? 'private',
          role: 'owner' as const,
          memberCount: counts.get(s.id) ?? 1,
          createdAt: s.createdAt,
        }));

        const joined = memberRows.map(m => {
          const s = db.select().from(schema.spaces).where(eq(schema.spaces.id, m.spaceId)).get();
          return {
            id: m.spaceId,
            name: s?.name ?? 'Unknown space',
            icon: s?.icon ?? null,
            avatarColor: s?.avatarColor ?? null,
            visibility: s?.visibility ?? 'private',
            role: 'member' as const,
            memberCount: counts.get(m.spaceId) ?? 0,
            createdAt: s?.createdAt ?? m.joinedAt,
          };
        });
        const spaces = [...owned, ...joined].sort((a, b) => b.createdAt - a.createdAt);

        const moderationRows = db.select({
          ev: schema.moderationEvents,
          actorUsername: schema.users.username,
        })
          .from(schema.moderationEvents)
          .leftJoin(schema.users, eq(schema.users.id, schema.moderationEvents.actorId))
          .where(eq(schema.moderationEvents.userId, target.id))
          .orderBy(desc(schema.moderationEvents.createdAt))
          .all();

        const moderation: ModerationEvent[] = moderationRows.map(r => ({
          id: r.ev.id,
          userId: r.ev.userId,
          action: r.ev.action as ModerationAction,
          reason: r.ev.reason,
          actorId: r.ev.actorId ?? '',
          actorUsername: r.actorUsername ?? null,
          durationSeconds: r.ev.durationSeconds,
          expiresAt: r.ev.expiresAt,
          createdAt: r.ev.createdAt,
        }));

        const detail: AdminCenterUserDetail = {
          user: toAdminCenterUserRow(target),
          spaces,
          moderation,
        };
        return reply.code(200).send(detail);
      } catch (err: any) {
        return reply.code(500).send({ error: `Failed to load user detail: ${err.message}`, statusCode: 500 });
      }
    },
  );

  // ─── Netrex ───────────────────────────────────────────────────────────────

  app.get<{ Querystring: ListQuery }>(
    '/api/admin-center/netrex',
    { preHandler: [authenticate, requireStaff] },
    async (request, reply) => {
      try {
        const db = getDb();
        const { page, pageSize } = parsePagination(request.query.page, request.query.pageSize);
        const q = String(request.query.q ?? '').trim();
        const stateFilter = String(request.query.filter ?? 'all');
        const now = Date.now();

        const conditions: any[] = [
          eq(schema.users.isDeleted, 0),
          or(eq(schema.users.netrexEnabled, 1), isNotNull(schema.users.netrexExpiresAt))!,
        ];
        if (stateFilter === 'active') {
          conditions.push(and(eq(schema.users.netrexEnabled, 1), isNotNull(schema.users.netrexExpiresAt), gt(schema.users.netrexExpiresAt, now)));
        } else if (stateFilter === 'permanent') {
          conditions.push(and(eq(schema.users.netrexEnabled, 1), isNull(schema.users.netrexExpiresAt)));
        } else if (stateFilter === 'expired') {
          conditions.push(and(eq(schema.users.netrexEnabled, 0), isNotNull(schema.users.netrexExpiresAt), lte(schema.users.netrexExpiresAt, now)));
        }
        if (q) {
          const pattern = `%${q}%`;
          conditions.push(or(
            like(schema.users.username, pattern),
            like(schema.users.displayName, pattern),
          )!);
        }

        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const total = db.select({ n: count() }).from(schema.users).where(where).get()?.n ?? 0;
        const rows = db.select().from(schema.users)
          .where(where)
          .orderBy(desc(schema.users.netrexExpiresAt))
          .limit(pageSize)
          .offset((page - 1) * pageSize)
          .all();

        const response: AdminCenterUsersResponse = {
          users: rows.map(toAdminCenterUserRow),
          total,
          page,
          pageSize,
        };
        return reply.code(200).send(response);
      } catch (err: any) {
        return reply.code(500).send({ error: `Failed to list netrex grants: ${err.message}`, statusCode: 500 });
      }
    },
  );

  app.post<{ Params: { id: string }; Body: { permanent?: boolean; durationMinutes?: number } }>(
    '/api/admin-center/users/:id/netrex',
    { preHandler: [authenticate, requireStaffRank(STAFF_MANAGE_NETREX_MIN_RANK)] },
    async (request, reply) => {
      try {
        const actor = request.staff!;
        const target = getDb().select().from(schema.users).where(eq(schema.users.id, request.params.id)).get();
        if (!target || target.isDeleted === 1) {
          return reply.code(404).send({ error: 'User not found', statusCode: 404 });
        }
        if (target.homeInstance) {
          return reply.code(403).send({ error: 'Netrex cannot be granted to federated users', statusCode: 403 });
        }
        if (targetRankViolation(actor, target)) {
          return reply.code(403).send({ error: 'You cannot manage the grant of staff at or above your rank', statusCode: 403 });
        }

        const permanent = request.body?.permanent === true;
        const rawDuration = Number(request.body?.durationMinutes);
        if (!permanent) {
          if (!Number.isFinite(rawDuration) || rawDuration <= 0 || rawDuration > MAX_GRANT_MINUTES) {
            return reply.code(400).send({ error: `durationMinutes must be between 1 and ${MAX_GRANT_MINUTES}`, statusCode: 400 });
          }
        }

        const db = getDb();
        const now = Date.now();
        const currentExpiry = target.netrexExpiresAt ?? 0;
        const base = currentExpiry > now ? currentExpiry : now;
        const expiresAt = permanent ? null : base + Math.round(rawDuration) * 60000;

        db.update(schema.users)
          .set({ netrexEnabled: 1, netrexExpiresAt: expiresAt })
          .where(eq(schema.users.id, target.id))
          .run();

        writeAuditLog({
          actorId: actor.userId,
          action: 'netrex_grant',
          targetId: target.id,
          targetType: 'user',
          metadata: { permanent, durationMinutes: permanent ? null : Math.round(rawDuration), expiresAt },
        });

        broadcastUserUpdated(target.id);

        const updated = getDb().select().from(schema.users).where(eq(schema.users.id, target.id)).get()!;
        const result: NetrexStatusResult = {
          userId: updated.id,
          netrexEnabled: true,
          netrexExpiresAt: updated.netrexExpiresAt ?? null,
          netrexState: computeNetrexState(updated),
        };
        return reply.code(200).send(result);
      } catch (err: any) {
        return reply.code(500).send({ error: `Failed to grant netrex: ${err.message}`, statusCode: 500 });
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/admin-center/users/:id/netrex/revoke',
    { preHandler: [authenticate, requireStaffRank(STAFF_MANAGE_NETREX_MIN_RANK)] },
    async (request, reply) => {
      try {
        const actor = request.staff!;
        const target = getDb().select().from(schema.users).where(eq(schema.users.id, request.params.id)).get();
        if (!target || target.isDeleted === 1) {
          return reply.code(404).send({ error: 'User not found', statusCode: 404 });
        }
        if (target.netrexEnabled === 0 && (target.netrexExpiresAt ?? 0) <= Date.now()) {
          return reply.code(400).send({ error: 'This user has no active netrex grant', statusCode: 400 });
        }

        getDb().update(schema.users)
          .set({ netrexEnabled: 0, netrexExpiresAt: null })
          .where(eq(schema.users.id, target.id))
          .run();

        writeAuditLog({
          actorId: actor.userId,
          action: 'netrex_revoke',
          targetId: target.id,
          targetType: 'user',
          metadata: { revokedAt: Date.now() },
        });

        broadcastUserUpdated(target.id);

        const result: NetrexStatusResult = {
          userId: target.id,
          netrexEnabled: false,
          netrexExpiresAt: null,
          netrexState: 'none',
        };
        return reply.code(200).send(result);
      } catch (err: any) {
        return reply.code(500).send({ error: `Failed to revoke netrex: ${err.message}`, statusCode: 500 });
      }
    },
  );

  // ─── Netrex Extend ───────────────────────────────────────────────────────────────

  app.post<{ Params: { id: string }; Body: { durationMinutes: number } }>(
    '/api/admin-center/users/:id/netrex/extend',
    { preHandler: [authenticate, requireStaffRank(STAFF_MANAGE_NETREX_MIN_RANK)] },
    async (request, reply) => {
      try {
        const actor = request.staff!;
        const target = getDb().select().from(schema.users).where(eq(schema.users.id, request.params.id)).get();
        if (!target || target.isDeleted === 1) {
          return reply.code(404).send({ error: 'User not found', statusCode: 404 });
        }
        if (target.netrexEnabled === 0 || (target.netrexExpiresAt ?? 0) <= Date.now()) {
          return reply.code(400).send({ error: 'This user has no active netrex grant', statusCode: 400 });
        }
        if (targetRankViolation(actor, target)) {
          return reply.code(403).send({ error: 'You cannot manage the grant of staff at or above your rank', statusCode: 403 });
        }

        const rawDuration = Number(request.body?.durationMinutes);
        if (!Number.isFinite(rawDuration) || rawDuration <= 0 || rawDuration > MAX_GRANT_MINUTES) {
          return reply.code(400).send({ error: `durationMinutes must be between 1 and ${MAX_GRANT_MINUTES}`, statusCode: 400 });
        }

        const db = getDb();
        const now = Date.now();
        const currentExpiry = target.netrexExpiresAt ?? 0;
        const base = currentExpiry > now ? currentExpiry : now;
        const expiresAt = base + Math.round(rawDuration) * 60000;

        db.update(schema.users)
          .set({ netrexExpiresAt: expiresAt })
          .where(eq(schema.users.id, target.id))
          .run();

        writeAuditLog({
          actorId: actor.userId,
          action: 'netrex_extend',
          targetId: target.id,
          targetType: 'user',
          metadata: { durationMinutes: Math.round(rawDuration), expiresAt },
        });

        broadcastUserUpdated(target.id);

        const updated = getDb().select().from(schema.users).where(eq(schema.users.id, target.id)).get()!;
        const result: NetrexStatusResult = {
          userId: updated.id,
          netrexEnabled: true,
          netrexExpiresAt: updated.netrexExpiresAt ?? null,
          netrexState: computeNetrexState(updated),
        };
        return reply.code(200).send(result);
      } catch (err: any) {
        return reply.code(500).send({ error: `Failed to extend netrex: ${err.message}`, statusCode: 500 });
      }
    },
  );

  // ─── Staff ────────────────────────────────────────────────────────────────

  app.get('/api/admin-center/staff', { preHandler: [authenticate, requireStaff] }, async (_request, reply) => {
    try {
      const db = getDb();
      const rows = db.select({
        sr: schema.staffRoles,
        username: schema.users.username,
        displayName: schema.users.displayName,
        avatar: schema.users.avatar,
        avatarColor: schema.users.avatarColor,
        isAdmin: schema.users.isAdmin,
      })
        .from(schema.staffRoles)
        .leftJoin(schema.users, eq(schema.users.id, schema.staffRoles.userId))
        .all();

      const staff: StaffMember[] = rows.map(r => ({
        userId: r.sr.userId,
        role: isStaffRole(r.sr.role) ? r.sr.role : 'moderator',
        grantedBy: r.sr.grantedBy ?? '',
        grantedByUsername: r.sr.grantedBy ? (getUserOrNull(r.sr.grantedBy)?.username ?? null) : null,
        grantedAt: r.sr.grantedAt,
        updatedAt: r.sr.updatedAt,
        username: r.username ?? 'Unknown',
        displayName: r.displayName,
        avatar: r.avatar,
        avatarColor: r.avatarColor,
        isAdmin: r.isAdmin === 1,
      }));

      const adminRows = db.select()
        .from(schema.users)
        .where(and(eq(schema.users.isAdmin, 1), eq(schema.users.isDeleted, 0)))
        .all();
      for (const a of adminRows) {
        if (staff.some(s => s.userId === a.id)) continue;
        staff.push({
          userId: a.id,
          role: 'administrator',
          grantedBy: '',
          grantedByUsername: null,
          grantedAt: 0,
          updatedAt: 0,
          username: a.username,
          displayName: a.displayName,
          avatar: a.avatar,
          avatarColor: a.avatarColor,
          isAdmin: true,
        });
      }
      staff.sort((x, y) => (STAFF_RANK[y.role] ?? 0) - (STAFF_RANK[x.role] ?? 0));

      return reply.code(200).send({ staff });
    } catch (err: any) {
      return reply.code(500).send({ error: `Failed to list staff: ${err.message}`, statusCode: 500 });
    }
  });

  app.post<{ Body: { userId: string; role: StaffRole } }>(
    '/api/admin-center/staff',
    { preHandler: [authenticate, requireStaffRank(STAFF_MANAGE_STAFF_MIN_RANK)] },
    async (request, reply) => {
      try {
        const actor = request.staff!;
        const body = request.body ?? {};
        if (typeof body.userId !== 'string' || !body.userId) {
          return reply.code(400).send({ error: 'userId is required', statusCode: 400 });
        }
        if (!STAFF_ROLES.includes(body.role)) {
          return reply.code(400).send({ error: `role must be one of ${STAFF_ROLES.join(', ')}`, statusCode: 400 });
        }

        const target = getDb().select().from(schema.users).where(eq(schema.users.id, body.userId)).get();
        if (!target || target.isDeleted === 1) {
          return reply.code(404).send({ error: 'User not found', statusCode: 404 });
        }
        if (target.homeInstance) {
          return reply.code(403).send({ error: 'Staff roles cannot be assigned to federated users', statusCode: 403 });
        }

        const violation = staffChangeViolation(actor, target, body.role);
        if (violation) {
          return reply.code(403).send({ error: violation, statusCode: 403 });
        }

        const db = getDb();
        const now = Date.now();
        const existing = db.select().from(schema.staffRoles).where(eq(schema.staffRoles.userId, body.userId)).get();

        if (existing) {
          db.update(schema.staffRoles).set({ role: body.role, updatedAt: now }).where(eq(schema.staffRoles.userId, body.userId)).run();
        } else {
          db.insert(schema.staffRoles).values({ userId: body.userId, role: body.role, grantedBy: actor.userId, grantedAt: now, updatedAt: now }).run();
        }
        db.update(schema.users).set({ staffRole: body.role }).where(eq(schema.users.id, body.userId)).run();

        writeAuditLog({
          actorId: actor.userId,
          action: 'staff_assign',
          targetId: body.userId,
          targetType: 'user',
          metadata: { role: body.role, previousRole: existing && isStaffRole(existing.role) ? existing.role : null },
        });

        broadcastUserUpdated(body.userId);

        const sr = db.select().from(schema.staffRoles).where(eq(schema.staffRoles.userId, body.userId)).get()!;
        const result: StaffAssignResult = {
          staffMember: {
            userId: sr.userId,
            role: sr.role as StaffRole,
            grantedBy: sr.grantedBy ?? '',
            grantedByUsername: sr.grantedBy ? (getUserOrNull(sr.grantedBy)?.username ?? null) : null,
            grantedAt: sr.grantedAt,
            updatedAt: sr.updatedAt,
            username: target.username,
            displayName: target.displayName,
            avatar: target.avatar,
            avatarColor: target.avatarColor,
            isAdmin: target.isAdmin === 1,
          },
        };
        return reply.code(200).send(result);
      } catch (err: any) {
        return reply.code(500).send({ error: `Failed to assign staff role: ${err.message}`, statusCode: 500 });
      }
    },
  );

  app.patch<{ Params: { userId: string }; Body: { role: StaffRole } }>(
    '/api/admin-center/staff/:userId',
    { preHandler: [authenticate, requireStaffRank(STAFF_MANAGE_STAFF_MIN_RANK)] },
    async (request, reply) => {
      try {
        const actor = request.staff!;
        const body = request.body ?? {};
        if (!STAFF_ROLES.includes(body.role)) {
          return reply.code(400).send({ error: `role must be one of ${STAFF_ROLES.join(', ')}`, statusCode: 400 });
        }

        const target = getDb().select().from(schema.users).where(eq(schema.users.id, request.params.userId)).get();
        if (!target || target.isDeleted === 1) {
          return reply.code(404).send({ error: 'User not found', statusCode: 404 });
        }

        const existing = getDb().select().from(schema.staffRoles).where(eq(schema.staffRoles.userId, target.id)).get();
        if (!existing) {
          return reply.code(404).send({ error: 'User has no staff role', statusCode: 404 });
        }

        const violation = staffChangeViolation(actor, target, body.role);
        if (violation) {
          return reply.code(403).send({ error: violation, statusCode: 403 });
        }

        getDb().update(schema.staffRoles).set({ role: body.role, updatedAt: Date.now() }).where(eq(schema.staffRoles.userId, target.id)).run();
        getDb().update(schema.users).set({ staffRole: body.role }).where(eq(schema.users.id, target.id)).run();

        writeAuditLog({
          actorId: actor.userId,
          action: 'staff_change_role',
          targetId: target.id,
          targetType: 'user',
          metadata: { role: body.role, previousRole: existing.role },
        });

        broadcastUserUpdated(target.id);
        return reply.code(200).send({ success: true });
      } catch (err: any) {
        return reply.code(500).send({ error: `Failed to change staff role: ${err.message}`, statusCode: 500 });
      }
    },
  );

  app.delete<{ Params: { userId: string } }>(
    '/api/admin-center/staff/:userId',
    { preHandler: [authenticate, requireStaffRank(STAFF_MANAGE_STAFF_MIN_RANK)] },
    async (request, reply) => {
      try {
        const actor = request.staff!;
        const target = getDb().select().from(schema.users).where(eq(schema.users.id, request.params.userId)).get();
        if (!target || target.isDeleted === 1) {
          return reply.code(404).send({ error: 'User not found', statusCode: 404 });
        }

        const existing = getDb().select().from(schema.staffRoles).where(eq(schema.staffRoles.userId, target.id)).get();
        if (!existing) {
          return reply.code(404).send({ error: 'User has no staff role', statusCode: 404 });
        }

        const violation = staffChangeViolation(actor, target, null);
        if (violation) {
          return reply.code(403).send({ error: violation, statusCode: 403 });
        }

        getDb().delete(schema.staffRoles).where(eq(schema.staffRoles.userId, target.id)).run();
        getDb().update(schema.users).set({ staffRole: null }).where(eq(schema.users.id, target.id)).run();

        writeAuditLog({
          actorId: actor.userId,
          action: 'staff_remove',
          targetId: target.id,
          targetType: 'user',
          metadata: { removedRole: existing.role },
        });

        broadcastUserUpdated(target.id);
        return reply.code(200).send({ success: true });
      } catch (err: any) {
        return reply.code(500).send({ error: `Failed to remove staff role: ${err.message}`, statusCode: 500 });
      }
    },
  );

  // ─── Moderation ───────────────────────────────────────────────────────────

  app.post<{ Params: { id: string }; Body: { action: ModerationAction; reason?: string; durationHours?: number } }>(
    '/api/admin-center/users/:id/moderation',
    { preHandler: [authenticate, requireStaffRank(STAFF_MODERATE_MIN_RANK)] },
    async (request, reply) => {
      try {
        const actor = request.staff!;
        const db = getDb();
        const now = Date.now();
        const body = request.body ?? {};
        const action = body.action;
        if (!action || !['warn', 'timeout', 'ban', 'unban'].includes(action)) {
          return reply.code(400).send({ error: 'action must be warn, timeout, ban or unban', statusCode: 400 });
        }

        const rawReason = body.reason;
        if (rawReason !== undefined && rawReason !== null && rawReason !== '') {
          if (typeof rawReason !== 'string') {
            return reply.code(400).send({ error: 'reason must be a string', statusCode: 400 });
          }
          if (rawReason.length > MAX_REASON_LENGTH) {
            return reply.code(400).send({ error: `reason must be at most ${MAX_REASON_LENGTH} characters`, statusCode: 400 });
          }
        }
        const reason = typeof rawReason === 'string' && rawReason !== '' ? rawReason : null;

        const target = db.select().from(schema.users).where(eq(schema.users.id, request.params.id)).get();
        if (!target || target.isDeleted === 1) {
          return reply.code(404).send({ error: 'User not found', statusCode: 404 });
        }

        const needsBanRank = action === 'timeout' || action === 'ban' || action === 'unban';
        if (needsBanRank && actor.rank < STAFF_BAN_MIN_RANK) {
          return reply.code(403).send({ error: 'You do not have permission to perform this action', statusCode: 403 });
        }
        if ((action === 'ban' || action === 'timeout') && target.id === actor.userId) {
          return reply.code(400).send({ error: 'You cannot moderate your own account', statusCode: 400 });
        }
        if ((action === 'ban' || action === 'timeout') && targetRankViolation(actor, target)) {
          return reply.code(403).send({ error: 'You cannot moderate staff at or above your rank', statusCode: 403 });
        }

        let expiresAt: number | null = null;
        let durationSeconds: number | null = null;
        if (action === 'timeout' || action === 'ban') {
          const rawHours = Number(body.durationHours ?? 0);
          if (action === 'timeout') {
            if (!Number.isFinite(rawHours) || rawHours <= 0 || rawHours > MAX_TIMEOUT_HOURS) {
              return reply.code(400).send({ error: `durationHours must be between 1 and ${MAX_TIMEOUT_HOURS}`, statusCode: 400 });
            }
            expiresAt = now + rawHours * 3600000;
            durationSeconds = Math.round(rawHours * 3600);
          } else if (rawHours > 0) {
            if (rawHours > MAX_TIMEOUT_HOURS) {
              return reply.code(400).send({ error: `durationHours must be at most ${MAX_TIMEOUT_HOURS}`, statusCode: 400 });
            }
            expiresAt = now + rawHours * 3600000;
            durationSeconds = Math.round(rawHours * 3600);
          } else {
            expiresAt = PERMANENT_BAN_UNTIL;
          }
        }

        if (action === 'warn') {
          db.insert(schema.moderationEvents).values({
            id: crypto.randomUUID(),
            userId: target.id,
            action,
            reason,
            actorId: actor.userId,
            durationSeconds: null,
            expiresAt: null,
            createdAt: now,
          }).run();
        } else if (action === 'ban' || action === 'timeout') {
          db.update(schema.users)
            .set({ bannedUntil: expiresAt, banReason: reason, bannedAt: now, bannedBy: actor.userId })
            .where(eq(schema.users.id, target.id))
            .run();
          db.insert(schema.moderationEvents).values({
            id: crypto.randomUUID(),
            userId: target.id,
            action,
            reason,
            actorId: actor.userId,
            durationSeconds,
            expiresAt,
            createdAt: now,
          }).run();
          connectionManager.forceDisconnectUser(target.id);
        } else if (action === 'unban') {
          db.update(schema.users)
            .set({ bannedUntil: null, banReason: null, bannedAt: null, bannedBy: null })
            .where(eq(schema.users.id, target.id))
            .run();
          db.insert(schema.moderationEvents).values({
            id: crypto.randomUUID(),
            userId: target.id,
            action,
            reason,
            actorId: actor.userId,
            durationSeconds: null,
            expiresAt: null,
            createdAt: now,
          }).run();
        }

        writeAuditLog({
          actorId: actor.userId,
          action: `moderation_${action}`,
          targetId: target.id,
          targetType: 'user',
          metadata: { reason, expiresAt, durationSeconds },
        });

        const updated = getDb().select().from(schema.users).where(eq(schema.users.id, target.id)).get()!;
        const result: ModerationResult = {
          user: toAdminCenterUserRow(updated),
          event: {
            id: '',
            userId: updated.id,
            action,
            reason,
            actorId: actor.userId,
            actorUsername: actor.username,
            durationSeconds,
            expiresAt,
            createdAt: now,
          },
        };
        return reply.code(200).send(result);
      } catch (err: any) {
        return reply.code(500).send({ error: `Failed to apply moderation action: ${err.message}`, statusCode: 500 });
      }
    },
  );

  // ─── Audit Log ────────────────────────────────────────────────────────────

  app.get<{ Querystring: ListQuery }>(
    '/api/admin-center/audit-log',
    { preHandler: [authenticate, requireStaff] },
    async (request, reply) => {
      try {
        const db = getDb();
        const { page, pageSize } = parsePagination(request.query.page, request.query.pageSize);
        const q = String(request.query.q ?? '').trim();
        const action = String(request.query.action ?? '').trim();
        const actor = String(request.query.actor ?? '').trim();
        const from = Number(request.query.from ?? '') || undefined;
        const to = Number(request.query.to ?? '') || undefined;

        const conditions: any[] = [];
        if (action) conditions.push(eq(schema.auditLog.action, action));
        if (actor) {
          const pattern = `%${actor}%`;
          const byUsername = db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.username, actor)).get();
          if (byUsername) {
            conditions.push(eq(schema.auditLog.actorId, byUsername.id));
          } else {
            conditions.push(sql`${schema.auditLog.actorId} IN (SELECT id FROM users WHERE username LIKE ${pattern})`);
          }
        }
        if (q) {
          const pattern = `%${q}%`;
          conditions.push(or(
            like(schema.auditLog.action, pattern),
            like(schema.auditLog.targetId, pattern),
            like(schema.auditLog.metadata, pattern),
          )!);
        }
        if (from) conditions.push(gte(schema.auditLog.createdAt, from));
        if (to) conditions.push(lte(schema.auditLog.createdAt, to));

        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const total = db.select({ n: count() }).from(schema.auditLog).where(where).get()?.n ?? 0;
        const rows = db.select({
          al: schema.auditLog,
          actorUsername: schema.users.username,
        })
          .from(schema.auditLog)
          .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.actorId))
          .where(where)
          .orderBy(desc(schema.auditLog.createdAt))
          .limit(pageSize)
          .offset((page - 1) * pageSize)
          .all();

        const entries: AuditLogEntry[] = rows.map(r => ({
          id: r.al.id,
          actorId: r.al.actorId ?? '',
          actorUsername: r.actorUsername ?? null,
          action: r.al.action,
          targetId: r.al.targetId,
          targetType: r.al.targetType,
          metadata: r.al.metadata,
          createdAt: r.al.createdAt,
        }));

        const response: AuditLogResponse = { entries, total, page, pageSize };
        return reply.code(200).send(response);
      } catch (err: any) {
        return reply.code(500).send({ error: `Failed to load audit log: ${err.message}`, statusCode: 500 });
      }
    },
  );

  // ─── Spaces ───────────────────────────────────────────────────────────────

  app.get<{ Querystring: ListQuery }>(
    '/api/admin-center/spaces',
    { preHandler: [authenticate, requireStaff] },
    async (request, reply) => {
      try {
        const db = getDb();
        const { page, pageSize } = parsePagination(request.query.page, request.query.pageSize);
        const q = String(request.query.q ?? '').trim();
        const sort = String(request.query.sort ?? 'newest');
        const visibility = String(request.query.visibility ?? '').trim();

        const memberCountExpr = sql<number>`(SELECT COUNT(*) FROM space_members sm WHERE sm.space_id = ${schema.spaces.id})`;
        const conditions: any[] = [];
        if (q) conditions.push(like(schema.spaces.name, `%${q}%`));
        if (visibility === 'public' || visibility === 'discoverable' || visibility === 'private' || visibility === 'request') {
          conditions.push(eq(schema.spaces.visibility, visibility));
        }

        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const total = db.select({ n: count() }).from(schema.spaces).where(where).get()?.n ?? 0;

        let orderBy: any;
        switch (sort) {
          case 'oldest': orderBy = asc(schema.spaces.createdAt); break;
          case 'az': orderBy = asc(schema.spaces.name); break;
          case 'popular': orderBy = desc(memberCountExpr); break;
          default: orderBy = desc(schema.spaces.createdAt); break;
        }

        const rows = db.select({
          id: schema.spaces.id,
          name: schema.spaces.name,
          icon: schema.spaces.icon,
          avatarColor: schema.spaces.avatarColor,
          visibility: schema.spaces.visibility,
          ownerId: schema.spaces.ownerId,
          ownerUsername: schema.users.username,
          memberCount: memberCountExpr,
          createdAt: schema.spaces.createdAt,
        })
          .from(schema.spaces)
          .innerJoin(schema.users, eq(schema.users.id, schema.spaces.ownerId))
          .where(where)
          .orderBy(orderBy)
          .limit(pageSize)
          .offset((page - 1) * pageSize)
          .all();

        const spaces: AdminCenterSpaceRow[] = rows.map(r => ({
          id: r.id,
          name: r.name,
          icon: r.icon,
          avatarColor: r.avatarColor,
          visibility: r.visibility ?? 'private',
          ownerId: r.ownerId,
          ownerUsername: r.ownerUsername,
          memberCount: Number(r.memberCount ?? 0),
          createdAt: r.createdAt,
        }));

        const response: AdminCenterSpacesResponse = { spaces, total, page, pageSize };
        return reply.code(200).send(response);
      } catch (err: any) {
        return reply.code(500).send({ error: `Failed to list spaces: ${err.message}`, statusCode: 500 });
      }
    },
  );

  app.get(
    '/api/admin-center/spaces/:id',
    { preHandler: [authenticate, requireStaff] },
    async (request, reply) => {
      try {
        const db = getDb();
        const { id } = request.params as { id: string };
        const space = db.select().from(schema.spaces).where(eq(schema.spaces.id, id)).get();
        if (!space) {
          return reply.code(404).send({ error: 'Space not found', statusCode: 404 });
        }
        const owner = db.select().from(schema.users).where(eq(schema.users.id, space.ownerId)).get();
        const memberCount = db.select({ n: count() }).from(schema.spaceMembers).where(eq(schema.spaceMembers.spaceId, space.id)).get()?.n ?? 0;
        const channelCount = db.select({ n: count() }).from(schema.channels).where(eq(schema.channels.spaceId, space.id)).get()?.n ?? 0;
        const pendingJoinRequests = db.select({ n: count() }).from(schema.joinRequests)
          .where(and(eq(schema.joinRequests.spaceId, space.id), eq(schema.joinRequests.status, 'pending')))
          .get()?.n ?? 0;
        const bannedMembers = db.select({ n: count() }).from(schema.bans).where(eq(schema.bans.spaceId, space.id)).get()?.n ?? 0;

        const detail: AdminCenterSpaceDetail = {
          id: space.id,
          name: space.name,
          icon: space.icon,
          banner: space.banner,
          avatarColor: space.avatarColor,
          visibility: space.visibility ?? 'private',
          description: space.description,
          ownerId: space.ownerId,
          ownerUsername: owner?.username ?? 'Unknown',
          memberCount,
          channelCount,
          pendingJoinRequests,
          bannedMembers,
          createdAt: space.createdAt,
        };
        return reply.code(200).send(detail);
      } catch (err: any) {
        return reply.code(500).send({ error: `Failed to load space detail: ${err.message}`, statusCode: 500 });
      }
    },
  );

  // ─── Activity ─────────────────────────────────────────────────────────────

  app.get('/api/admin-center/activity', { preHandler: [authenticate, requireStaff] }, async (_request, reply) => {
    try {
      const db = getDb();
      const now = Date.now();
      const dayAgo = now - 86400000;
      const monthAgo = now - 30 * 86400000;

      const onlineIds = connectionManager.getAllOnlineUserIds();
      const onlineRows: AdminCenterActivityRow[] = [];
      for (const uid of onlineIds.slice(0, 100)) {
        const row = getDb().select().from(schema.users).where(eq(schema.users.id, uid)).get();
        if (!row || row.isDeleted === 1) continue;
        onlineRows.push({
          userId: row.id,
          username: row.username,
          displayName: row.displayName,
          avatar: row.avatar,
          avatarColor: row.avatarColor,
          status: connectionManager.getUserStatus(uid) || row.status || 'online',
          lastSeenAt: row.lastSeenAt ?? null,
          createdAt: row.createdAt,
          isOnline: true,
          activities: connectionManager.getUserActivities(uid),
        });
      }

      const recentRows = db.select().from(schema.users)
        .where(and(eq(schema.users.isDeleted, 0), isNotNull(schema.users.lastSeenAt), gte(schema.users.lastSeenAt, dayAgo), ne(schema.users.status, 'offline')))
        .orderBy(desc(schema.users.lastSeenAt))
        .limit(50)
        .all();

      const newRows = db.select().from(schema.users)
        .where(and(eq(schema.users.isDeleted, 0), gte(schema.users.createdAt, monthAgo)))
        .orderBy(desc(schema.users.createdAt))
        .limit(50)
        .all();

      const toRow = (r: (typeof schema.users)['$inferSelect'], isOnline: boolean, activities: AdminCenterActivityRow['activities']): AdminCenterActivityRow => ({
        userId: r.id,
        username: r.username,
        displayName: r.displayName,
        avatar: r.avatar,
        avatarColor: r.avatarColor,
        status: r.status ?? 'offline',
        lastSeenAt: r.lastSeenAt ?? null,
        createdAt: r.createdAt,
        isOnline,
        activities,
      });

      const response: AdminCenterActivityResponse = {
        recentActive: recentRows.filter(r => !onlineIds.includes(r.id)).map(r => toRow(r, false, [])),
        online: onlineRows,
        newUsers: newRows.map(r => toRow(r, onlineIds.includes(r.id), [])),
      };
      return reply.code(200).send(response);
    } catch (err: any) {
      return reply.code(500).send({ error: `Failed to load activity: ${err.message}`, statusCode: 500 });
    }
  });
}
import { eq } from 'drizzle-orm';
import { STAFF_RANK, STAFF_ROLES, type StaffRole } from '@vertex/shared';
import { getDb, schema } from '../db/index.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

export interface StaffIdentity {
  userId: string;
  username: string;
  role: StaffRole;
  rank: number;
}

const STAFF_ROLE_SET = new Set<string>(STAFF_ROLES);

export function isStaffRole(value: string | null | undefined): value is StaffRole {
  return !!value && STAFF_ROLE_SET.has(value);
}

export function resolveStaffIdentity(userId: string): StaffIdentity | null {
  const db = getDb();
  const row = db.select({
    staffRole: schema.users.staffRole,
    isAdmin: schema.users.isAdmin,
    username: schema.users.username,
  }).from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!row) return null;
  if (isStaffRole(row.staffRole)) {
    return { userId, username: row.username, role: row.staffRole, rank: STAFF_RANK[row.staffRole] };
  }
  if (row.isAdmin === 1) {
    return { userId, username: row.username, role: 'administrator' as StaffRole, rank: STAFF_RANK.administrator };
  }
  return null;
}

function deny(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(403).send({ error: message, statusCode: 403 });
}

export async function requireStaff(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const identity = resolveStaffIdentity(request.userId);
  if (!identity) return void deny(reply, 'Only staff members can perform this action');
  (request as FastifyRequest & { staff?: StaffIdentity }).staff = identity;
}

export function requireStaffRank(minRank: number): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request, reply) => {
    const identity = resolveStaffIdentity(request.userId);
    if (!identity) return void deny(reply, 'Only staff members can perform this action');
    if (identity.rank < minRank) return void deny(reply, 'You do not have permission to perform this action');
    (request as FastifyRequest & { staff?: StaffIdentity }).staff = identity;
  };
}

export const STAFF_MANAGE_NETREX_MIN_RANK = STAFF_RANK.administrator;
export const STAFF_MANAGE_STAFF_MIN_RANK = STAFF_RANK.administrator;
export const STAFF_MODERATE_MIN_RANK = STAFF_RANK.moderator;
export const STAFF_BAN_MIN_RANK = STAFF_RANK.senior_moderator;

declare module 'fastify' {
  interface FastifyRequest {
    staff?: StaffIdentity;
  }
}
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { setWorkerId } from '../utils/snowflake.js';
import { signJwt, verifyJwtAndUser } from '../utils/auth.js';

setWorkerId(21);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

type TestDb = ReturnType<typeof drizzle<typeof schema>>;
let sqlite: Database.Database;
let testDb: TestDb;
let app: FastifyInstance;
let tusTmpDir: string;

vi.mock('../db/index.js', () => ({
  getDb: () => testDb,
  getRawDb: () => sqlite,
  schema,
}));

vi.mock('../config.js', async () => {
  const real = await import('../config.js');
  return {
    config: new Proxy(real.config, {
      get(target, prop: string) {
        if (prop === 'tusUploadDir') return tusTmpDir;
        return (target as Record<string, unknown>)[prop];
      },
    }),
  };
});

function applyMigrations(db: Database.Database): void {
  const migrationsDir = path.resolve(__dirname, '../../drizzle');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sqlText = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
    const statements = sqlText.split(/-->\s*statement-breakpoint/);
    for (const stmt of statements) {
      const clean = stmt.trim();
      if (clean) db.exec(clean);
    }
  }

  // The profile-board column comes from the runtime ensureColumn migration,
  // not a drizzle file — mirror it here for tests that seed users through the
  // drizzle schema (which now includes profileBoard).
  try {
    db.prepare('SELECT profile_board FROM users LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE users ADD COLUMN profile_board TEXT');
  }
}

async function buildApp(): Promise<FastifyInstance> {
  const { adminCenterRoutes } = await import('./adminCenter.js');
  const f = Fastify();
  await f.register(adminCenterRoutes);
  return f;
}

const ADMIN_ID = 'admin-1';
const MOD_ID = 'mod-1';
const SENIOR_ID = 'senior-1';
const USER_ID = 'user-1';
const FED_ID = 'fed-1';

const now = Date.now();

beforeEach(async () => {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  applyMigrations(sqlite);
  testDb = drizzle(sqlite, { schema });

  testDb.insert(schema.users).values([
    {
      id: ADMIN_ID,
      username: 'admin',
      passwordHash: 'x',
      isAdmin: 1,
      createdAt: now,
    },
    {
      id: MOD_ID,
      username: 'moderator',
      passwordHash: 'x',
      isAdmin: 0,
      staffRole: 'moderator',
      createdAt: now,
    },
    {
      id: SENIOR_ID,
      username: 'senior',
      passwordHash: 'x',
      isAdmin: 0,
      staffRole: 'senior_moderator',
      createdAt: now,
    },
    {
      id: USER_ID,
      username: 'normie',
      passwordHash: 'x',
      isAdmin: 0,
      createdAt: now,
    },
    {
      id: FED_ID,
      username: 'remote@external.example',
      passwordHash: 'x',
      isAdmin: 0,
      homeInstance: 'external.example',
      createdAt: now,
    },
  ]).run();

  testDb.insert(schema.staffRoles).values([
    { userId: MOD_ID, role: 'moderator', grantedBy: ADMIN_ID, grantedAt: now, updatedAt: now },
    { userId: SENIOR_ID, role: 'senior_moderator', grantedBy: ADMIN_ID, grantedAt: now, updatedAt: now },
  ]).run();

  tusTmpDir = path.join(os.tmpdir(), `backspace-admincenter-tus-${crypto.randomBytes(8).toString('hex')}`);
  app = await buildApp();
});

afterEach(() => {
  if (fs.existsSync(tusTmpDir)) {
    fs.rmSync(tusTmpDir, { recursive: true, force: true });
  }
});

function tok(userId: string, username: string): string {
  return signJwt({ userId, username });
}
const adminToken = () => tok(ADMIN_ID, 'admin');
const modToken = () => tok(MOD_ID, 'moderator');
const seniorToken = () => tok(SENIOR_ID, 'senior');
const userToken = () => tok(USER_ID, 'normie');

function auditCount(action: string): number {
  return testDb.select().from(schema.auditLog).where(eq(schema.auditLog.action, action)).all().length;
}

describe('Admin Center auth gating', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin-center/summary' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects non-staff users with 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin-center/summary',
      headers: { Authorization: `Bearer ${userToken()}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('resolves legacy admins (isAdmin) as administrator rank 5', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin-center/summary',
      headers: { Authorization: `Bearer ${adminToken()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.viewer.role).toBe('administrator');
    expect(body.viewer.rank).toBe(5);
    expect(body.viewer.canManageNetrex).toBe(true);
    expect(body.viewer.canManageStaff).toBe(true);
    expect(body.viewer.canBan).toBe(true);
  });

  it('moderators get a scoped viewer caps', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin-center/summary',
      headers: { Authorization: `Bearer ${modToken()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.viewer.role).toBe('moderator');
    expect(body.viewer.rank).toBe(1);
    expect(body.viewer.canModerate).toBe(true);
    expect(body.viewer.canBan).toBe(false);
    expect(body.viewer.canManageNetrex).toBe(false);
    expect(body.viewer.canManageStaff).toBe(false);
  });
});

describe('Admin Center netrex grants', () => {
  it('grants a permanent grant (expiresAt null) and writes audit', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin-center/users/${USER_ID}/netrex`,
      headers: { Authorization: `Bearer ${adminToken()}` },
      payload: { permanent: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.netrexEnabled).toBe(true);
    expect(body.netrexExpiresAt).toBeNull();
    expect(body.netrexState).toBe('permanent');
    expect(auditCount('netrex_grant')).toBe(1);
  });

  it('grants an expiring grant and computes active state', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin-center/users/${USER_ID}/netrex`,
      headers: { Authorization: `Bearer ${adminToken()}` },
      payload: { durationMinutes: 600 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.netrexState).toBe('active');
    expect(body.netrexExpiresAt).toBeGreaterThan(Date.now() + 599 * 60 * 1000);
    const list = await app.inject({
      method: 'GET',
      url: '/api/admin-center/netrex?filter=active',
      headers: { Authorization: `Bearer ${modToken()}` },
    });
    expect(list.statusCode).toBe(200);
    const listBody = list.json();
    expect(listBody.users.some((u: { id: string }) => u.id === USER_ID)).toBe(true);
  });

  it('revokes an active grant and writes audit', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/admin-center/users/${USER_ID}/netrex`,
      headers: { Authorization: `Bearer ${adminToken()}` },
      payload: { permanent: true },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin-center/users/${USER_ID}/netrex/revoke`,
      headers: { Authorization: `Bearer ${adminToken()}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().netrexState).toBe('none');
    expect(auditCount('netrex_revoke')).toBe(1);
  });

  it('rejects grants to federated users', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin-center/users/${FED_ID}/netrex`,
      headers: { Authorization: `Bearer ${adminToken()}` },
      payload: { permanent: true },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects invalid durations', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin-center/users/${USER_ID}/netrex`,
      headers: { Authorization: `Bearer ${adminToken()}` },
      payload: { durationMinutes: 0 },
    });
    const bad = await app.inject({
      method: 'POST',
      url: `/api/admin-center/users/${USER_ID}/netrex`,
      headers: { Authorization: `Bearer ${adminToken()}` },
      payload: { durationMinutes: 999999999 },
    });
    expect(res.statusCode).toBe(400);
    expect(bad.statusCode).toBe(400);
  });

  it('moderators cannot manage netrex', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin-center/users/${USER_ID}/netrex`,
      headers: { Authorization: `Bearer ${modToken()}` },
      payload: { permanent: true },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('Admin Center staff management', () => {
  it('assigns a staff role, syncs users.staffRole and writes audit', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin-center/staff',
      headers: { Authorization: `Bearer ${adminToken()}` },
      payload: { userId: USER_ID, role: 'support' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().staffMember.role).toBe('support');
    const user = testDb.select().from(schema.users).where(eq(schema.users.id, USER_ID)).get()!;
    expect(user.staffRole).toBe('support');
    expect(auditCount('staff_assign')).toBe(1);
  });

  it('changes and removes a staff role', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/admin-center/staff',
      headers: { Authorization: `Bearer ${adminToken()}` },
      payload: { userId: USER_ID, role: 'support' },
    });
    const change = await app.inject({
      method: 'PATCH',
      url: `/api/admin-center/staff/${USER_ID}`,
      headers: { Authorization: `Bearer ${adminToken()}` },
      payload: { role: 'developer' },
    });
    expect(change.statusCode).toBe(200);
    expect(testDb.select().from(schema.users).where(eq(schema.users.id, USER_ID)).get()!.staffRole).toBe('developer');
    expect(auditCount('staff_change_role')).toBe(1);

    const remove = await app.inject({
      method: 'DELETE',
      url: `/api/admin-center/staff/${USER_ID}`,
      headers: { Authorization: `Bearer ${adminToken()}` },
    });
    expect(remove.statusCode).toBe(200);
    expect(testDb.select().from(schema.users).where(eq(schema.users.id, USER_ID)).get()!.staffRole).toBeNull();
    expect(auditCount('staff_remove')).toBe(1);
  });

  it('blocks non-owner from assigning the owner role', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin-center/staff',
      headers: { Authorization: `Bearer ${adminToken()}` },
      payload: { userId: USER_ID, role: 'owner' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects staff roles for federated users', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin-center/staff',
      headers: { Authorization: `Bearer ${adminToken()}` },
      payload: { userId: FED_ID, role: 'support' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('moderators cannot manage staff', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin-center/staff',
      headers: { Authorization: `Bearer ${modToken()}` },
      payload: { userId: USER_ID, role: 'support' },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('Admin Center moderation', () => {
  it('moderators can warn users', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin-center/users/${USER_ID}/moderation`,
      headers: { Authorization: `Bearer ${modToken()}` },
      payload: { action: 'warn', reason: 'keep it civil' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.event.action).toBe('warn');
    expect(body.event.actorUsername).toBe('moderator');
    expect(body.event.reason).toBe('keep it civil');
    const eventRow = testDb.select().from(schema.moderationEvents).where(eq(schema.moderationEvents.userId, USER_ID)).get();
    expect(eventRow?.action).toBe('warn');
    expect(auditCount('moderation_warn')).toBe(1);
  });

  it('moderators cannot ban', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin-center/users/${USER_ID}/moderation`,
      headers: { Authorization: `Bearer ${modToken()}` },
      payload: { action: 'ban', reason: 'done' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('senior moderators can ban and the ban blocks future auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin-center/users/${USER_ID}/moderation`,
      headers: { Authorization: `Bearer ${seniorToken()}` },
      payload: { action: 'ban', reason: 'spam', durationHours: 24 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.bannedUntil).not.toBeNull();
    expect(body.event.expiresAt).toBeGreaterThan(Date.now());
    expect(auditCount('moderation_ban')).toBe(1);

    await expect(verifyJwtAndUser(userToken())).rejects.toMatchObject({ statusCode: 403 });
  });

  it('permanent ban uses the sentinel timestamp', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin-center/users/${USER_ID}/moderation`,
      headers: { Authorization: `Bearer ${adminToken()}` },
      payload: { action: 'ban', reason: 'bye' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().event.expiresAt).toBe(253402300799999);
  });

  it('unban clears the ban and writes audit', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/admin-center/users/${USER_ID}/moderation`,
      headers: { Authorization: `Bearer ${seniorToken()}` },
      payload: { action: 'ban', reason: 'temp' },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin-center/users/${USER_ID}/moderation`,
      headers: { Authorization: `Bearer ${adminToken()}` },
      payload: { action: 'unban' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.bannedUntil).toBeNull();
    expect(auditCount('moderation_unban')).toBe(1);
    await expect(verifyJwtAndUser(userToken())).resolves.toMatchObject({ userId: USER_ID });
  });

  it('blocks moderating your own account', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin-center/users/${SENIOR_ID}/moderation`,
      headers: { Authorization: `Bearer ${seniorToken()}` },
      payload: { action: 'ban' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('records the event in the user detail endpoint', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/admin-center/users/${USER_ID}/moderation`,
      headers: { Authorization: `Bearer ${seniorToken()}` },
      payload: { action: 'warn', reason: 'first' },
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/admin-center/users/${USER_ID}`,
      headers: { Authorization: `Bearer ${modToken()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.moderation.length).toBe(1);
    expect(body.moderation[0].action).toBe('warn');
    expect(body.user.username).toBe('normie');
  });
});

describe('Admin Center lists and audit-log', () => {
  it('filters users and reports netrex/staff state', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/admin-center/users/${USER_ID}/netrex`,
      headers: { Authorization: `Bearer ${adminToken()}` },
      payload: { permanent: true },
    });
    const netrexRes = await app.inject({
      method: 'GET',
      url: '/api/admin-center/users?filter=netrex&sort=newest&pageSize=25',
      headers: { Authorization: `Bearer ${modToken()}` },
    });
    expect(netrexRes.statusCode).toBe(200);
    const netrexBody = netrexRes.json();
    expect(netrexBody.users.some((u: { id: string }) => u.id === USER_ID && u.netrexState === 'permanent')).toBe(true);
    expect(netrexBody.users.some((u: { id: string }) => u.id === MOD_ID)).toBe(false);

    const staffRes = await app.inject({
      method: 'GET',
      url: '/api/admin-center/users?filter=staff&pageSize=25',
      headers: { Authorization: `Bearer ${modToken()}` },
    });
    expect(staffRes.statusCode).toBe(200);
    const staffBody = staffRes.json();
    expect(staffBody.users.some((u: { id: string }) => u.id === MOD_ID && u.staffRole === 'moderator')).toBe(true);
  });

  it('excludes deleted users by default', async () => {
    testDb.update(schema.users).set({ isDeleted: 1 }).where(eq(schema.users.id, USER_ID)).run();
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin-center/users',
      headers: { Authorization: `Bearer ${modToken()}` },
    });
    const body = res.json();
    expect(body.users.some((u: { id: string }) => u.id === USER_ID)).toBe(false);
  });

  it('searches UI_state safe search by username', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/admin-center/users?q=${encodeURIComponent('normie')}`,
      headers: { Authorization: `Bearer ${modToken()}` },
    });
    const body = res.json();
    expect(body.users.some((u: { id: string }) => u.id === USER_ID)).toBe(true);
  });

  it('lists spaces with member counts and visibility', async () => {
    testDb.insert(schema.spaces).values({
      id: 'sp-1',
      name: 'Fios',
      visibility: 'public',
      ownerId: USER_ID,
      description: null,
      banner: null,
      icon: null,
      avatarColor: null,
      createdAt: now,
    }).run();
    testDb.insert(schema.spaceMembers).values({ spaceId: 'sp-1', userId: USER_ID, joinedAt: now }).run();
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin-center/spaces',
      headers: { Authorization: `Bearer ${modToken()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.spaces).toHaveLength(1);
    expect(body.spaces[0]).toMatchObject({ id: 'sp-1', name: 'Fios', ownerUsername: 'normie', memberCount: 1 });
  });

  it('returns audit-log entries with actor usernames', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/admin-center/users/${USER_ID}/netrex`,
      headers: { Authorization: `Bearer ${adminToken()}` },
      payload: { permanent: true },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin-center/audit-log?pageSize=25',
      headers: { Authorization: `Bearer ${modToken()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const entry = body.entries.find((e: { action: string }) => e.action === 'netrex_grant');
    expect(entry).toBeTruthy();
    expect(entry!.actorUsername).toBe('admin');
    expect(entry!.targetId).toBe(USER_ID);
  });

  it('filters audit-log by action and actor', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/admin-center/users/${USER_ID}/moderation`,
      headers: { Authorization: `Bearer ${seniorToken()}` },
      payload: { action: 'warn' },
    });
    const byAction = await app.inject({
      method: 'GET',
      url: encodeURI('/api/admin-center/audit-log?action=moderation_warn'),
      headers: { Authorization: `Bearer ${modToken()}` },
    });
    expect(byAction.json().entries).toHaveLength(1);
    const byActor = await app.inject({
      method: 'GET',
      url: encodeURI('/api/admin-center/audit-log?actor=senior'),
      headers: { Authorization: `Bearer ${modToken()}` },
    });
    expect(byActor.json().entries).toHaveLength(1);
  });

  it('returns activity groups', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin-center/activity',
      headers: { Authorization: `Bearer ${modToken()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.online)).toBe(true);
    expect(Array.isArray(body.recentActive)).toBe(true);
    expect(Array.isArray(body.newUsers)).toBe(true);
  });
});
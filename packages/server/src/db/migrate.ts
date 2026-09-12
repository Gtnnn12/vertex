import Database from 'better-sqlite3';
import crypto from 'crypto';
import { config } from '../config.js';

/**
 * Ensure data invariants after schema migration. Idempotent — safe to run
 * on every boot. Uses raw better-sqlite3 handle (not Drizzle ORM).
 */
export function ensureDefaults(db: Database.Database): void {
  // 0. Ensure admin-center columns exist in users table
  const ensureColumn = (table: string, column: string, ddl: string): void => {
    try {
      db.prepare(`SELECT ${column} FROM ${table} LIMIT 1`).get();
    } catch {
      try {
        db.prepare(`ALTER TABLE ${table} ADD COLUMN ${ddl}`).run();
        console.log(`[defaults] Added ${column} column to ${table} table`);
      } catch (err) {
        console.warn(`[defaults] Could not add ${column} column to ${table}:`, err);
      }
    }
  };

  ensureColumn('users', 'netrex_enabled', 'netrex_enabled INTEGER DEFAULT 0');
  ensureColumn('users', 'netrex_expires_at', 'netrex_expires_at INTEGER');
  ensureColumn('users', 'profile_board', 'profile_board TEXT');
  ensureColumn('users', 'profile_accent', 'profile_accent TEXT');
  ensureColumn('users', 'staff_role', 'staff_role TEXT');
  ensureColumn('users', 'last_seen_at', 'last_seen_at INTEGER');
  ensureColumn('users', 'banned_until', 'banned_until INTEGER');
  ensureColumn('users', 'ban_reason', 'ban_reason TEXT');
  ensureColumn('users', 'banned_at', 'banned_at INTEGER');
  ensureColumn('users', 'banned_by', 'banned_by TEXT');

  const ensureTable = (sql: string): void => {
    try {
      db.prepare(sql).run();
    } catch (err) {
      console.warn('[defaults] Could not create admin-center table:', err);
    }
  };

  ensureTable(`CREATE TABLE IF NOT EXISTS staff_roles (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    granted_by TEXT REFERENCES users(id),
    granted_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  ensureTable(`CREATE TABLE IF NOT EXISTS moderation_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    reason TEXT,
    actor_id TEXT REFERENCES users(id),
    duration_seconds INTEGER,
    expires_at INTEGER,
    created_at INTEGER NOT NULL
  )`);
  ensureTable(`CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    actor_id TEXT REFERENCES users(id),
    action TEXT NOT NULL,
    target_id TEXT,
    target_type TEXT,
    metadata TEXT,
    created_at INTEGER NOT NULL
  )`);
  ensureTable('CREATE INDEX IF NOT EXISTS idx_moderation_events_user_id ON moderation_events(user_id)');
  ensureTable('CREATE INDEX IF NOT EXISTS idx_moderation_events_created_at ON moderation_events(created_at)');
  ensureTable('CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at)');
  ensureTable('CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action)');

  // 1. Ensure the single-row instance_settings row exists
  const row = db.prepare('SELECT id FROM instance_settings WHERE id = 1').get();
  if (!row) {
    db.prepare(
      `INSERT OR IGNORE INTO instance_settings
        (id, max_bitrate_kbps, min_bitrate_kbps, bitrate_step_kbps,
         allowed_resolutions, allowed_framerates, max_resolution, max_framerate, updated_at)
       VALUES (1, 20000, 500, 500, ?, ?, 2160, 60, ?)`
    ).run('720,1080,1440,2160', '30,60', Date.now());
    console.log('[defaults] Inserted default instance_settings row');
  }

  // 2. Ensure a unique Snowflake worker ID is persisted (0-1023)
  const settings = db.prepare('SELECT worker_id FROM instance_settings WHERE id = 1').get() as
    { worker_id: number | null } | undefined;
  if (!settings || settings.worker_id === null) {
    const workerId = crypto.randomInt(0, 1024);
    db.prepare('UPDATE instance_settings SET worker_id = ? WHERE id = 1').run(workerId);
    console.log(`[defaults] Generated Snowflake worker ID: ${workerId}`);
  }

  // 2b. Ensure a persistent instance epoch (incarnation UUID) exists. A fresh
  // DB mints a new one — this is the discriminator for detecting resets.
  // The id=1 row is guaranteed by step 1's INSERT OR IGNORE above.
  const epochRow = db.prepare('SELECT instance_id FROM instance_settings WHERE id = 1').get() as
    { instance_id: string | null } | undefined;
  if (!epochRow || epochRow.instance_id === null) {
    const instanceId = crypto.randomUUID();
    const res = db.prepare('UPDATE instance_settings SET instance_id = ? WHERE id = 1').run(instanceId);
    if (res.changes !== 1) throw new Error('ensureDefaults: instance_settings id=1 row missing — cannot mint epoch');
    console.log('[defaults] Generated instance epoch');
  }

  // 2c. Brand sweep: instances that never customized their name still carry the
  // pre-rebrand product default. Rename ONLY the exact legacy default — a name
  // an admin actually chose (even one containing "Backspace") is never touched.
  // Guarded on the column existing: ensureDefaults also runs against minimal
  // harness schemas (tests) that predate instance_name.
  const instanceColumns = db.prepare('PRAGMA table_info(instance_settings)').all() as
    { name: string }[];
  if (instanceColumns.some((c) => c.name === 'instance_name')) {
    const rebranded = db
      .prepare("UPDATE instance_settings SET instance_name = 'VERTEX' WHERE instance_name = 'Backspace'")
      .run();
    if (rebranded.changes > 0) {
      console.log(`[defaults] Rebranded legacy default instance name → VERTEX (${rebranded.changes} row)`);
    }
  }

  // 3. Ensure at least one admin exists (promote earliest registered user)
  const anyAdmin = db.prepare('SELECT id FROM users WHERE is_admin = 1 LIMIT 1').get();
  if (!anyAdmin) {
    const firstUser = db.prepare(
      'SELECT id FROM users ORDER BY created_at ASC LIMIT 1'
    ).get() as { id: string } | undefined;
    if (firstUser) {
      db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(firstUser.id);
      console.log(`[defaults] Promoted first user ${firstUser.id} to admin`);
    }
  }

  // 3.5. Web portal support messages (site /support → /admin tray).
  ensureTable(`CREATE TABLE IF NOT EXISTS web_support_messages (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    username TEXT NOT NULL,
    subject TEXT NOT NULL,
    category TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    response TEXT,
    responded_at INTEGER,
    responded_by TEXT,
    response_seen_at INTEGER,
    created_at INTEGER NOT NULL
  )`);
  try { db.prepare('CREATE INDEX IF NOT EXISTS idx_web_support_status ON web_support_messages(status)').run(); } catch {}
  try { db.prepare('CREATE INDEX IF NOT EXISTS idx_web_support_user_id ON web_support_messages(user_id)').run(); } catch {}
  try { db.prepare('CREATE INDEX IF NOT EXISTS idx_web_support_created_at ON web_support_messages(created_at)').run(); } catch {}

  // 3.6. Support conversation threads (web /support → threaded inbox).
  ensureTable(`CREATE TABLE IF NOT EXISTS web_support_threads (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    username TEXT NOT NULL,
    subject TEXT NOT NULL,
    category TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    user_read_at INTEGER,
    admin_read_at INTEGER,
    last_message_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`);
  ensureTable(`CREATE TABLE IF NOT EXISTS web_support_thread_messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES web_support_threads(id) ON DELETE CASCADE,
    author TEXT NOT NULL,
    author_name TEXT NOT NULL,
    author_user_id TEXT,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`);
  try { db.prepare('CREATE INDEX IF NOT EXISTS idx_web_threads_user_id ON web_support_threads(user_id)').run(); } catch {}
  try { db.prepare('CREATE INDEX IF NOT EXISTS idx_web_threads_last_message_at ON web_support_threads(last_message_at)').run(); } catch {}
  try { db.prepare('CREATE INDEX IF NOT EXISTS idx_web_thread_messages_thread_id ON web_support_thread_messages(thread_id)').run(); } catch {}
  try { db.prepare('CREATE INDEX IF NOT EXISTS idx_web_thread_messages_created_at ON web_support_thread_messages(created_at)').run(); } catch {}

  // 4. Owner bootstrap (backend source of truth for the OWNER rank).
  // If OWNER_EMAIL is configured, the matching account is promoted to
  // staffRole='owner' (+ is_admin=1) on every boot. Idempotent: an account that
  // is already owner is left untouched, and no other account is ever demoted
  // here — owner removal stays an explicit Admin Center operation.
  const ownerEmail = config.ownerEmail;
  const usersTableExists = !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (ownerEmail && usersTableExists) {
    const hasUsernameCol = !!db.prepare("SELECT name FROM pragma_table_info('users') WHERE name='username'").get();
    if (hasUsernameCol) {
      const ownerRow = db.prepare(
        "SELECT id, staff_role FROM users WHERE lower(username) = ? AND is_deleted = 0 LIMIT 1"
      ).get(ownerEmail) as { id: string; staff_role: string | null } | undefined;
      if (ownerRow && ownerRow.staff_role !== 'owner') {
        db.prepare("UPDATE users SET staff_role = 'owner', is_admin = 1 WHERE id = ?").run(ownerRow.id);
        console.log(`[defaults] Promoted ${ownerRow.id} (${ownerEmail}) to owner`);
      }
    }
  }
}

/**
 * One-time, idempotent recovery of 1-on-1 DM threads broken before the DM
 * tombstone fix: those had the deleted partner's dm_members row removed, making
 * the thread UI-unreachable. For each ownerId-NULL channel with exactly one
 * member, re-insert membership for any distinct dm_messages author that is
 * missing from dm_members and still exists in users. Safe to run every boot.
 */
export function backfillOneOnOneDmMembership(db: Database.Database): void {
  const broken = db.prepare(`
    SELECT dc.id AS channelId
    FROM dm_channels dc
    WHERE dc.owner_id IS NULL
      AND (SELECT COUNT(*) FROM dm_members dm WHERE dm.dm_channel_id = dc.id) = 1
  `).all() as { channelId: string }[];
  if (broken.length === 0) return;

  const missingAuthors = db.prepare(`
    SELECT DISTINCT msg.user_id AS userId
    FROM dm_messages msg
    JOIN users u ON u.id = msg.user_id
    WHERE msg.dm_channel_id = ?
      AND msg.user_id NOT IN (SELECT user_id FROM dm_members WHERE dm_channel_id = ?)
  `);
  const insertMember = db.prepare('INSERT INTO dm_members (dm_channel_id, user_id, closed) VALUES (?, ?, 0)');

  let restored = 0;
  const run = db.transaction(() => {
    for (const { channelId } of broken) {
      const authors = missingAuthors.all(channelId, channelId) as { userId: string }[];
      for (const { userId } of authors) { insertMember.run(channelId, userId); restored++; }
    }
  });
  run();
  if (restored > 0) console.log(`[backfill] restored ${restored} deleted-partner DM membership row(s)`);
}

import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { ensureDefaults, ensureOwnerBootstrap } from './migrate.js';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE instance_settings (id integer PRIMARY KEY, worker_id integer, instance_id text, max_bitrate_kbps integer, min_bitrate_kbps integer, bitrate_step_kbps integer, allowed_resolutions text, allowed_framerates text, max_resolution integer, max_framerate integer, updated_at integer);
    CREATE TABLE users (id text PRIMARY KEY, is_admin integer DEFAULT 0, created_at integer);`);
  return db;
}

describe('ensureDefaults instance epoch', () => {
  it('mints an instance_id when null and is idempotent', () => {
    const db = freshDb();
    ensureDefaults(db);
    const first = (db.prepare('SELECT instance_id FROM instance_settings WHERE id = 1').get() as { instance_id: string }).instance_id;
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    ensureDefaults(db);
    const second = (db.prepare('SELECT instance_id FROM instance_settings WHERE id = 1').get() as { instance_id: string }).instance_id;
    expect(second).toBe(first); // stable across boots
  });

  it('mints a different id for a separate fresh DB', () => {
    const a = freshDb(); ensureDefaults(a);
    const b = freshDb(); ensureDefaults(b);
    const idA = (a.prepare('SELECT instance_id FROM instance_settings WHERE id = 1').get() as { instance_id: string }).instance_id;
    const idB = (b.prepare('SELECT instance_id FROM instance_settings WHERE id = 1').get() as { instance_id: string }).instance_id;
    expect(idA).not.toBe(idB);
  });
});

describe('ensureOwnerBootstrap', () => {
  function ownerDb(): Database.Database {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE users (id text PRIMARY KEY, username text, is_admin integer DEFAULT 0, is_deleted integer DEFAULT 0, staff_role text, netrex_enabled integer DEFAULT 0, netrex_expires_at integer);`);
    return db;
  }

  it('promotes the matching account to owner and grants permanent netrex', () => {
    const db = ownerDb();
    db.prepare("INSERT INTO users (id, username) VALUES ('u1', 'zzz')").run();
    ensureOwnerBootstrap(db, 'zzz');
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get('u1') as any;
    expect(row.staff_role).toBe('owner');
    expect(row.is_admin).toBe(1);
    expect(row.netrex_enabled).toBe(1);
    expect(row.netrex_expires_at).toBeNull();
  });

  it('is idempotent and never downgrades an existing admin-grant expiry back', () => {
    const db = ownerDb();
    db.prepare("INSERT INTO users (id, username, staff_role, netrex_enabled, netrex_expires_at) VALUES ('u1', 'zzz', 'owner', 1, NULL)").run();
    ensureOwnerBootstrap(db, 'zzz');
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get('u1') as any;
    expect(row.staff_role).toBe('owner');
    expect(row.netrex_enabled).toBe(1);
    expect(row.netrex_expires_at).toBeNull();
  });

  it('converts an expiring grant into a permanent one on boot', () => {
    const db = ownerDb();
    db.prepare("INSERT INTO users (id, username, netrex_enabled, netrex_expires_at) VALUES ('u1', 'zzz', 1, 9999999999999)").run();
    ensureOwnerBootstrap(db, 'zzz');
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get('u1') as any;
    expect(row.netrex_enabled).toBe(1);
    expect(row.netrex_expires_at).toBeNull();
  });

  it('does nothing when no account matches (no rows created)', () => {
    const db = ownerDb();
    ensureOwnerBootstrap(db, 'ghost');
    const n = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as any).n;
    expect(n).toBe(0);
  });

  it('skips deleted accounts', () => {
    const db = ownerDb();
    db.prepare("INSERT INTO users (id, username, is_deleted) VALUES ('u1', 'zzz', 1)").run();
    ensureOwnerBootstrap(db, 'zzz');
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get('u1') as any;
    expect(row.staff_role).toBeNull();
    expect(row.netrex_enabled).toBe(0);
  });

  it('is case-insensitive on the username match', () => {
    const db = ownerDb();
    db.prepare("INSERT INTO users (id, username) VALUES ('u1', 'ZZZ')").run();
    ensureOwnerBootstrap(db, 'zzz');
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get('u1') as any;
    expect(row.staff_role).toBe('owner');
  });
});

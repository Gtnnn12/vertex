import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from '../db/schema.js';
import { setWorkerId } from '../utils/snowflake.js';
import type { Activity } from '@backspace/shared';

setWorkerId(1);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
type TestDb = ReturnType<typeof drizzle<typeof schema>>;

let testDb: TestDb;

vi.mock('../db/index.js', () => ({
  getDb: () => testDb,
  schema,
}));

vi.mock('../utils/federationAuth.js', () => ({
  getOurOrigin: () => 'https://local.example',
  buildFederationHeaders: () => ({}),
  generateHmacSecret: () => 'test-secret',
}));

vi.mock('../utils/federationOutbox.js', () => ({
  appendMutationLog: vi.fn(),
  queueOutboxEvent: vi.fn(),
  queueDmRelay: vi.fn(),
  getGroupDmTargetOrigins: vi.fn(() => []),
  sendCallRelay: vi.fn(),
  computeFederatedId: vi.fn(),
  sendTypingRelay: vi.fn(),
  queueReadStateRelay: vi.fn(),
  isFederationRelayEnabled: vi.fn(() => false),
}));

function applyMigrations(db: Database.Database): void {
  const migrationsDir = path.resolve(__dirname, '../../drizzle');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
    for (const stmt of sql.split(/-->\s*statement-breakpoint/)) {
      if (stmt.trim()) db.exec(stmt.trim());
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

let userCounter = 0;

async function importSUT() {
  return await import('./events.js');
}

/** Desktop Vía A push exactly as the renderer sends it. */
function desktopTrackPush(): Activity[] {
  return [{
    type: 'spotify',
    name: 'Spotify',
    spotify: {
      song: 'CARITA FELIZ',
      artist: 'Myke Towers',
      albumCover: 'https://i.scdn.co/image/cover',
      progressMs: 0,
      durationMs: 0,
      isPlaying: true,
      fetchedAt: 1_700_000_000_000,
    },
  }];
}

beforeEach(() => {
  const sqlite = new Database(':memory:');
  testDb = drizzle(sqlite, { schema });
  applyMigrations(sqlite);
  userCounter += 1;
});

describe('activity_update: spotify payload preservation (Vía A)', () => {
  it('keeps song/artist/cover through validation and broadcasts them', async () => {
    const { handleClientEvent } = await importSUT();
    const { connectionManager } = await import('./handler.js');
    const user = `u-${userCounter}`;

    connectionManager.setUserShowActivity(user, true);
    const sendSpy = vi.spyOn(connectionManager, 'sendToUser');

    handleClientEvent({ type: 'activity_update', activities: desktopTrackPush() }, user, user, {} as never, false);

    const stored = connectionManager.getUserActivities(user);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.type).toBe('spotify');
    expect(stored[0]!.spotify?.song).toBe('CARITA FELIZ');
    expect(stored[0]!.spotify?.artist).toBe('Myke Towers');
    expect(stored[0]!.spotify?.albumCover).toBe('https://i.scdn.co/image/cover');

    const broadcast = sendSpy.mock.calls
      .map(([, ev]) => ev as { type: string; activities?: Activity[] })
      .filter((ev) => ev.type === 'presence_update');
    expect(broadcast.length).toBeGreaterThan(0);
    expect(broadcast[0]!.activities?.[0]?.spotify?.song).toBe('CARITA FELIZ');
  });

  it('drops a stored desktop track when the push stops carrying one (ads/menus)', async () => {
    const { handleClientEvent } = await importSUT();
    const { connectionManager } = await import('./handler.js');
    const user = `u-${userCounter}`;

    connectionManager.setUserShowActivity(user, true);
    // Seed the stored state a previous desktop push would have left behind
    // (a second immediate push would trip the 3s activity rate limit).
    connectionManager.setUserActivities(user, desktopTrackPush());

    handleClientEvent(
      { type: 'activity_update', activities: [{ type: 'listening', name: 'Spotify' }] },
      user, user, {} as never, false,
    );

    const stored = connectionManager.getUserActivities(user);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.type).toBe('listening');
    expect(stored[0]!.spotify).toBeUndefined();
  });
});

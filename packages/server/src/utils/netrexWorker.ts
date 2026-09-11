import { and, eq, isNotNull, lt } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { connectionManager } from '../ws/handler.js';
import { sanitizeUser } from './sanitize.js';
import { writeAuditLog } from './audit.js';
import { collectProfileBroadcastTargetIds } from './userDeletion.js';

const NETREX_SWEEP_INTERVAL_MS = 60 * 1000;

export function expireDueNetrexGrants(): number {
  const db = getDb();
  const now = Date.now();
  const expired = db.select().from(schema.users)
    .where(and(
      eq(schema.users.netrexEnabled, 1),
      isNotNull(schema.users.netrexExpiresAt),
      lt(schema.users.netrexExpiresAt, now),
    ))
    .all();
  if (expired.length === 0) return 0;

  for (const row of expired) {
    db.update(schema.users)
      .set({ netrexEnabled: 0 })
      .where(eq(schema.users.id, row.id))
      .run();

    writeAuditLog({
      actorId: 'system',
      action: 'netrex_expired',
      targetId: row.id,
      targetType: 'user',
      metadata: { expiredAt: row.netrexExpiresAt },
    });

    const updated = getDb().select().from(schema.users).where(eq(schema.users.id, row.id)).get()!;
    const event = { type: 'user_updated' as const, user: sanitizeUser(updated) };
    connectionManager.sendToUser(row.id, event);
    for (const uid of collectProfileBroadcastTargetIds(row.id)) {
      connectionManager.sendToUser(uid, event);
    }
  }

  return expired.length;
}

export function startNetrexExpiryWorker(): NodeJS.Timeout {
  const timer = setInterval(() => {
    try {
      const expired = expireDueNetrexGrants();
      if (expired > 0) console.log(`[netrex] Expired ${expired} grant(s)`);
    } catch (err) {
      console.warn('[netrex] Expiry sweep failed:', err);
    }
  }, NETREX_SWEEP_INTERVAL_MS);
  timer.unref();
  return timer;
}
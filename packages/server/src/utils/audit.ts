import crypto from 'crypto';
import { getDb, schema } from '../db/index.js';

export interface AuditEntryInput {
  actorId: string;
  action: string;
  targetId?: string | null;
  targetType?: string | null;
  metadata?: Record<string, unknown> | string | null;
}

export function writeAuditLog(entry: AuditEntryInput): void {
  getDb().insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    actorId: entry.actorId,
    action: entry.action,
    targetId: entry.targetId ?? null,
    targetType: entry.targetType ?? null,
    metadata: typeof entry.metadata === 'string'
      ? entry.metadata
      : entry.metadata
        ? JSON.stringify(entry.metadata)
        : null,
    createdAt: Date.now(),
  }).run();
}
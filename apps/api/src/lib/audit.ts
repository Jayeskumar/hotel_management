import type { FastifyRequest } from 'fastify';
import type { Executor } from '../db/client.js';
import { auditLogs } from '../db/schema.js';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  outletId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Write an audit record. Pass the transaction handle so audit and change commit atomically. */
export async function audit(db: Executor, req: FastifyRequest, entry: AuditEntry): Promise<void> {
  const user = req.user;
  await db.insert(auditLogs).values({
    organizationId: user.org,
    userId: user.sub,
    outletId: entry.outletId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    metadata: entry.metadata ?? null,
    ip: req.ip,
  });
}

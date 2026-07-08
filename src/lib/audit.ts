import { prisma } from './db';
import type { Role } from '@prisma/client';

/**
 * Append-only audit trail (NFR-07). Writes go to a table whose UPDATE/DELETE is
 * denied at the DB layer (rls.sql). Immigration-officer reads and other
 * sensitive actions must call this in the same request.
 */
export interface AuditEntry {
  actorUserId?: string;
  actorRole?: Role;
  action: string;
  resourceType: string;
  resourceId?: string;
  organizationId?: string;
  ip?: string;
  metadata?: Record<string, unknown>;
}

export async function audit(entry: AuditEntry): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorUserId: entry.actorUserId,
      actorRole: entry.actorRole,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      organizationId: entry.organizationId,
      ip: entry.ip,
      metadata: (entry.metadata ?? {}) as object,
    },
  });
}

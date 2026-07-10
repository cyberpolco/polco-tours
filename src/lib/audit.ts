import { prisma, withOrg } from './db';
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
  const data = {
    actorUserId: entry.actorUserId,
    actorRole: entry.actorRole,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    organizationId: entry.organizationId,
    ip: entry.ip,
    metadata: (entry.metadata ?? {}) as object,
  };

  // audit_select (rls.sql) only makes a row visible when its organizationId
  // is NULL or matches app.org_id. Prisma's create() implicitly does a
  // RETURNING, which acts as a SELECT on the just-inserted row -- so writing
  // a tenant-scoped entry via the plain global `prisma` client (app.org_id
  // unset) throws "new row violates row-level security policy" even though
  // the INSERT's own WITH CHECK (true) would have allowed it. Scope the
  // write with withOrg whenever we have an org to scope it to.
  if (entry.organizationId) {
    await withOrg(entry.organizationId, (tx) => tx.auditLog.create({ data }));
  } else {
    await prisma.auditLog.create({ data });
  }
}

/**
 * Crude, infra-free rate-limit primitive (no Upstash/Redis wired yet) --
 * counts recent matching audit entries for one IP. Used by the public
 * "find my booking" lookup (DR-016) to raise the cost of guessing a
 * confirmation code without needing real rate-limiting infrastructure.
 */
export async function countRecentAuditEvents(params: {
  organizationId: string;
  action: string;
  ip: string;
  sinceMinutes: number;
}): Promise<number> {
  const since = new Date(Date.now() - params.sinceMinutes * 60 * 1000);
  return withOrg(params.organizationId, (tx) =>
    tx.auditLog.count({
      where: { organizationId: params.organizationId, action: params.action, ip: params.ip, createdAt: { gte: since } },
    }),
  );
}

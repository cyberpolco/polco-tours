import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { withOrg, prisma } from '../src/lib/db';

/** Extends the RLS proof to the `audit_logs` table (Phase 0) -- a special
 * shape (see rls.sql's own comment on this table): INSERT is unrestricted
 * (WITH CHECK true), SELECT is org-scoped OR organizationId IS NULL (a
 * platform-wide row is visible from any context), and there is no
 * UPDATE/DELETE policy at all -- under FORCE ROW LEVEL SECURITY, Postgres
 * denies a command with no applicable policy by default (0 rows affected,
 * not a thrown error), so this table is genuinely append-only at the DB
 * layer, not just by application convention. */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;

beforeAll(async () => {
  orgA = (await admin.organization.create({ data: { name: `RLS-AUDIT-A-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' } })).id;
  orgB = (await admin.organization.create({ data: { name: `RLS-AUDIT-B-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' } })).id;
  await withOrg(orgA, (tx) => tx.auditLog.create({ data: { action: 'rls.test', resourceType: 'RlsFixture', organizationId: orgA } }));
  await withOrg(orgB, (tx) => tx.auditLog.create({ data: { action: 'rls.test', resourceType: 'RlsFixture', organizationId: orgB } }));
  // A platform-wide row (no organizationId) -- written via the plain global
  // client, same as audit()'s own else-branch for an org-less entry.
  await prisma.auditLog.create({ data: { action: 'rls.test.platform', resourceType: 'RlsFixture' } });
});

afterAll(async () => {
  // audit_logs has no DELETE policy -- the fixture rows created above are
  // genuinely undeletable by design (append-only audit trail), so there is
  // nothing to clean up here beyond the throwaway organizations themselves.
  // AuditLog.organizationId is a bare, non-FK uuid (same "outlive its
  // actors" reasoning as actorUserId, see the model's own comment), so
  // deleting the orgs below neither cascades into nor is blocked by these
  // rows -- they simply persist with a now-dangling organizationId, same
  // as any real org's audit trail would after that org was hard-deleted.
  if (!orgA || !orgB) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await admin.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('Row-Level Security: audit_logs tenant isolation', () => {
  it('org A sees its own audit log entry', async () => {
    const rows = await withOrg(orgA, (tx) => tx.auditLog.findMany({ where: { resourceType: 'RlsFixture', organizationId: orgA } }));
    expect(rows.length).toBe(1);
  });

  it('org B cannot see org A audit log entries', async () => {
    const rows = await withOrg(orgB, (tx) => tx.auditLog.findMany({ where: { resourceType: 'RlsFixture', organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('a platform-wide (organizationId null) entry is visible from any org context', async () => {
    const fromA = await withOrg(orgA, (tx) => tx.auditLog.findMany({ where: { action: 'rls.test.platform' } }));
    const fromB = await withOrg(orgB, (tx) => tx.auditLog.findMany({ where: { action: 'rls.test.platform' } }));
    expect(fromA.length).toBeGreaterThanOrEqual(1);
    expect(fromB.length).toBeGreaterThanOrEqual(1);
  });

  it('deny-by-default: no org scope hides tenant-scoped rows', async () => {
    const rows = await prisma.auditLog.findMany({ where: { resourceType: 'RlsFixture', organizationId: orgA } });
    expect(rows.length).toBe(0);
  });

  it('writing a tenant-scoped entry via the unscoped global client is rejected (RETURNING acts as a SELECT)', async () => {
    await expect(
      prisma.auditLog.create({ data: { action: 'rls.test.unscoped', resourceType: 'RlsFixture', organizationId: orgA } }),
    ).rejects.toThrow();
  });

  it('UPDATE is denied at the DB layer -- no rows are affected, not even the writer\'s own org', async () => {
    const result = await withOrg(orgA, (tx) =>
      tx.auditLog.updateMany({ where: { resourceType: 'RlsFixture', organizationId: orgA }, data: { action: 'rls.test.tampered' } }),
    );
    expect(result.count).toBe(0);
  });

  it('DELETE is denied at the DB layer -- no rows are affected', async () => {
    const result = await withOrg(orgA, (tx) => tx.auditLog.deleteMany({ where: { resourceType: 'RlsFixture', organizationId: orgA } }));
    expect(result.count).toBe(0);
  });
});

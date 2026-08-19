import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../src/lib/db';
import { analyticsRepository } from '../src/modules/analytics/repository';

/** DR-155: exercises the repository directly against a disposable test org
 * -- NOT the service's public recordWizardStep/purgeOldEvents, which are
 * hardwired to getPrimaryOrgId() (this app's one real primary org); a test
 * has no business writing/purging rows there. */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;
let orgId: string;

beforeAll(async () => {
  const org = await admin.organization.create({ data: { name: `ANALYTICS-REPO-${suffix}`, countries: ['NA'], status: 'VERIFIED' } });
  orgId = org.id;
});

afterAll(async () => {
  if (!orgId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await withOrg(orgId, (tx) => tx.wizardProgressEvent.deleteMany({ where: { organizationId: orgId } }));
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('analyticsRepository.upsertProgress', () => {
  it('is monotonic -- a later, lower step never decreases the stored highestStep', async () => {
    const sessionToken = `monotonic-${suffix}`;
    await analyticsRepository.upsertProgress(orgId, sessionToken, 5);
    await analyticsRepository.upsertProgress(orgId, sessionToken, 2); // e.g. the guest clicked "Back"
    const steps = await analyticsRepository.listHighestSteps(orgId);
    expect(steps).toEqual([5]);
  });

  it('raises the stored step when a later call is higher', async () => {
    const sessionToken = `raise-${suffix}`;
    await analyticsRepository.upsertProgress(orgId, sessionToken, 1);
    await analyticsRepository.upsertProgress(orgId, sessionToken, 6);
    const steps = await withOrg(orgId, (tx) => tx.wizardProgressEvent.findMany({ where: { sessionToken } }));
    expect(steps).toHaveLength(1);
    expect(steps[0]!.highestStep).toBe(6);
  });
});

describe('analyticsRepository.purgeOlderThan', () => {
  it('deletes only rows older than the cutoff', async () => {
    const oldToken = `old-${suffix}`;
    const freshToken = `fresh-${suffix}`;
    await analyticsRepository.upsertProgress(orgId, oldToken, 4);
    await analyticsRepository.upsertProgress(orgId, freshToken, 4);
    // Backdate the "old" row directly -- upsertProgress always sets createdAt/updatedAt to now().
    await withOrg(orgId, (tx) =>
      tx.wizardProgressEvent.update({ where: { sessionToken: oldToken }, data: { createdAt: new Date('2020-01-01') } }),
    );

    const purged = await analyticsRepository.purgeOlderThan(orgId, new Date('2025-01-01'));
    expect(purged).toBe(1);

    // Scoped to this test's own two tokens, not the whole org -- the earlier
    // `upsertProgress` describe block's rows share this same org fixture and
    // are never cleaned up between describe blocks within one file.
    const remaining = await withOrg(orgId, (tx) =>
      tx.wizardProgressEvent.findMany({ where: { organizationId: orgId, sessionToken: { in: [oldToken, freshToken] } } }),
    );
    expect(remaining.map((r) => r.sessionToken)).toEqual([freshToken]);
  });
});

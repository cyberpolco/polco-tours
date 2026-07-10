import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../src/lib/db';
import { catalogService } from '../src/modules/catalog';

/**
 * Public browse/quiz (DR-016) have no ctx/session -- they resolve the
 * primary org themselves. Seeds its OWN rows into the real seeded primary
 * org (Lam) rather than creating a second org, since getPrimaryOrgId()
 * would then non-deterministically pick between two isPrimary=true rows;
 * cleans up only the rows it created, never the org itself.
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;

let orgId: string;
let publishedPackageId: string;
let draftPackageId: string;
let scheduledDepartureId: string;
let cancelledDepartureId: string;

beforeAll(async () => {
  const primary = await admin.organization.findFirstOrThrow({ where: { isPrimary: true } });
  orgId = primary.id;

  await withOrg(orgId, async (tx) => {
    const published = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        title: `TEST-PUBLIC-PUBLISHED-${suffix}`,
        description: 'Fixture for public catalog tests.',
        country: 'NA',
        priceMinor: 50000,
        currency: 'USD',
        durationDays: 4,
        tags: ['WILDLIFE', 'ADVENTURE'],
        status: 'PUBLISHED',
      },
    });
    publishedPackageId = published.id;

    const draft = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        title: `TEST-PUBLIC-DRAFT-${suffix}`,
        description: 'Should never appear in public results.',
        country: 'NA',
        priceMinor: 50000,
        currency: 'USD',
        status: 'DRAFT',
      },
    });
    draftPackageId = draft.id;

    const scheduled = await tx.departure.create({
      data: { organizationId: orgId, tourPackageId: published.id, startDate: new Date('2027-01-10'), capacity: 8 },
    });
    scheduledDepartureId = scheduled.id;

    const cancelled = await tx.departure.create({
      data: {
        organizationId: orgId,
        tourPackageId: published.id,
        startDate: new Date('2027-02-10'),
        capacity: 8,
        status: 'CANCELLED',
      },
    });
    cancelledDepartureId = cancelled.id;
  });
});

afterAll(async () => {
  await withOrg(orgId, (tx) =>
    tx.departure.deleteMany({ where: { id: { in: [scheduledDepartureId, cancelledDepartureId] } } }),
  );
  await withOrg(orgId, (tx) => tx.tourPackage.deleteMany({ where: { id: { in: [publishedPackageId, draftPackageId] } } }));
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('catalogService public methods (DR-016)', () => {
  it('listPublicPackages includes a published package and excludes a draft one', async () => {
    const results = await catalogService.listPublicPackages();
    const ids = results.map((p) => p.id);
    expect(ids).toContain(publishedPackageId);
    expect(ids).not.toContain(draftPackageId);
  });

  it('getPublicPackageWithDepartures only returns the scheduled departure', async () => {
    const { pkg, departures } = await catalogService.getPublicPackageWithDepartures(publishedPackageId);
    expect(pkg.id).toBe(publishedPackageId);
    expect(departures.map((d) => d.id)).toEqual([scheduledDepartureId]);
  });

  it('getPublicPackageWithDepartures 404s for a draft package', async () => {
    await expect(catalogService.getPublicPackageWithDepartures(draftPackageId)).rejects.toThrow();
  });

  it('getPublicDepartureDetail is bookable for the scheduled departure', async () => {
    const detail = await catalogService.getPublicDepartureDetail(scheduledDepartureId);
    expect(detail.bookable).toBe(true);
  });

  it('getPublicDepartureDetail 404s for a cancelled departure', async () => {
    await expect(catalogService.getPublicDepartureDetail(cancelledDepartureId)).rejects.toThrow();
  });

  it('getQuizResults ranks a tag-matching package above non-matches', async () => {
    const results = await catalogService.getQuizResults({ tags: ['WILDLIFE', 'ADVENTURE'] });
    const index = results.findIndex((p) => p.id === publishedPackageId);
    expect(index).toBeGreaterThanOrEqual(0);
    // Every package before it in the ranking must score >= its own match count.
    const ownScore = 2;
    for (const p of results.slice(0, index)) {
      const score = p.tags.filter((t) => (['WILDLIFE', 'ADVENTURE'] as string[]).includes(t)).length;
      expect(score).toBeGreaterThanOrEqual(ownScore);
    }
  });
});

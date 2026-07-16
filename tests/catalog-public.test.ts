import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { formatPackageReference } from '@modules/catalog';
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
        packageReference: formatPackageReference(Date.now()),
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
        packageReference: formatPackageReference(Date.now()),
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
  // Guard: if beforeAll failed before these ids were all assigned, Prisma
  // silently drops/mishandles the undefined where-clause value, turning
  // these into unscoped deleteMany calls -- and since orgId here is the
  // real shared PRIMARY organization (not a throwaway fixture org), that
  // would wipe every package/departure belonging to it. This has hit real
  // production data twice already. Skip cleanup entirely rather than risk
  // it.
  if (!orgId || !publishedPackageId || !draftPackageId || !scheduledDepartureId || !cancelledDepartureId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
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

  it('listPublicPackages filters by country', async () => {
    const results = await catalogService.listPublicPackages({ country: 'CD' });
    expect(results.map((p) => p.id)).not.toContain(publishedPackageId);
  });

  it('listPublicPackages filters by a case-insensitive title/description search', async () => {
    const bySuffix = await catalogService.listPublicPackages({ search: suffix });
    expect(bySuffix.map((p) => p.id)).toContain(publishedPackageId);

    const byDescription = await catalogService.listPublicPackages({ search: 'fixture for public' });
    expect(byDescription.map((p) => p.id)).toContain(publishedPackageId);

    const noMatch = await catalogService.listPublicPackages({ search: 'no-such-package-xyz' });
    expect(noMatch.map((p) => p.id)).not.toContain(publishedPackageId);
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

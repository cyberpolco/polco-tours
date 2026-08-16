import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { testPackageReference } from './helpers/package-reference';
import { prisma, withOrg } from '../src/lib/db';
import { catalogService } from '../src/modules/catalog';
import type { AuthContext } from '../src/modules/auth/domain';
import type { Permission } from '../src/lib/rbac';

/**
 * DR-131: first publish (DRAFT -> a PUBLISHED_* status) re-derives
 * TourPackage.slug from whatever title the package is launching with,
 * rather than the one it was created under (DR-118's slug is otherwise
 * frozen forever). Own throwaway org, mirroring tests/fleet-delete.test.ts,
 * since this creates/updates package rows directly.
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;

let orgId: string;
let operatorId: string;

function ctx(): AuthContext {
  return {
    userId: operatorId,
    roles: ['TOUR_OPERATOR'],
    permissions: new Set<Permission>(['catalog.write']),
    organizationId: orgId,
    sessionId: 'test-session',
    mustChangePassword: false,
  };
}

async function createDraftPackage(title: string, slug: string) {
  return withOrg(orgId, (tx) =>
    tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: testPackageReference(),
        title,
        slug,
        description: 'Fixture for DR-131 slug-regeneration tests.',
        country: 'NA',
        countries: ['NA'],
        priceMinor: 100_000,
        currency: 'USD',
        durationDays: 5,
        status: 'DRAFT',
      },
    }),
  );
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `CATALOG-SLUG-TEST-${suffix}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;
  const operator = await admin.user.create({
    data: { email: `catalog-slug-operator-${suffix}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId },
  });
  operatorId = operator.id;
});

afterAll(async () => {
  if (!orgId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await withOrg(orgId, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
}, 30_000);

describe('catalogService.updatePackage slug regeneration (DR-131)', () => {
  it('leaves the slug untouched when a draft package is only renamed, not published', async () => {
    const pkg = await createDraftPackage(`Original Title A ${suffix}`, `original-title-a-${suffix}-frozen`);

    const updated = await catalogService.updatePackage(ctx(), pkg.id, { title: `Renamed While Draft ${suffix}` });

    expect(updated.slug).toBe(`original-title-a-${suffix}-frozen`);
  });

  it('regenerates the slug from the current title on first publish (DRAFT -> PUBLISHED_AVAILABLE)', async () => {
    const pkg = await createDraftPackage(`Stale Creation Title ${suffix}`, `stale-creation-title-${suffix}`);

    // Renamed while still draft, then published in the same call -- the
    // published slug must reflect the NEW title, not the creation-time one.
    const updated = await catalogService.updatePackage(ctx(), pkg.id, {
      title: `Launch Title B ${suffix}`,
      status: 'PUBLISHED_AVAILABLE',
    });

    expect(updated.slug).not.toBe(`stale-creation-title-${suffix}`);
    expect(updated.slug).toContain(`launch-title-b-${suffix}`);
  });

  it('keeps the slug frozen across further status changes once already published', async () => {
    const pkg = await createDraftPackage(`Publish Once Title ${suffix}`, `publish-once-title-${suffix}-old`);

    const firstPublish = await catalogService.updatePackage(ctx(), pkg.id, { status: 'PUBLISHED_AVAILABLE' });
    const slugAfterFirstPublish = firstPublish.slug;

    const madeUnavailable = await catalogService.updatePackage(ctx(), pkg.id, {
      title: `Retitled After Publish ${suffix}`,
      status: 'PUBLISHED_UNAVAILABLE',
    });

    expect(madeUnavailable.slug).toBe(slugAfterFirstPublish);
  });

  it('appends a numeric suffix when the regenerated slug collides with another package', async () => {
    const taken = await createDraftPackage(`Collision Title ${suffix}`, `collision-title-${suffix}`);
    await catalogService.updatePackage(ctx(), taken.id, { status: 'PUBLISHED_AVAILABLE' });

    const second = await createDraftPackage(`Second Package ${suffix}`, `second-package-${suffix}`);
    const published = await catalogService.updatePackage(ctx(), second.id, {
      title: `Collision Title ${suffix}`,
      status: 'PUBLISHED_AVAILABLE',
    });

    expect(published.slug).toBe(`collision-title-${suffix}-2`);
  });
});

import { prisma, withOrg } from '../../src/lib/db';
import { formatPackageReference } from '@modules/catalog';
import { testPackageReference } from '../../tests/helpers/package-reference';

/**
 * Seeds a published package + scheduled departure for guest-checkout e2e
 * assertions, decoupled from prisma/seed.ts's demo catalog content (which
 * may change independently of this test). Tenant-scoped tables MUST go
 * through withOrg -- RLS is live for the app under test, same as
 * booking-fixture.ts.
 */
export async function seedPublicDeparture(opts?: { capacity?: number }): Promise<{ departureId: string; visaAddonServiceId: string }> {
  const capacity = opts?.capacity ?? 2;
  const org = await prisma.organization.findFirstOrThrow({ where: { isPrimary: true } });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const { departureId, visaAddonServiceId } = await withOrg(org.id, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: org.id,
        packageReference: formatPackageReference(Date.now()),
        title: `E2E Guest Fixture Safari ${suffix}`,
        description: 'Fixture for guest-checkout e2e tests.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
        status: 'PUBLISHED_AVAILABLE',
      },
    });
    const departure = await tx.departure.create({
      data: {
        organizationId: org.id,
        tourPackageId: pkg.id,
        startDate: new Date('2027-06-01'),
        capacity,
        status: 'SCHEDULED',
      },
    });
    // Selecting this at the Add-ons step is what makes the Passport wizard
    // step appear at all (Booking.requiresPassportUpload) -- needed so the
    // guest-checkout e2e journey still exercises the real Vercel Blob
    // passport upload (OI-08), not just skips straight past it.
    const visaAddon = await tx.addonService.create({
      data: {
        organizationId: org.id,
        code: 'VISA_ASSISTANCE',
        name: `E2E Visa Assistance ${suffix}`,
        description: 'Fixture add-on for guest-checkout e2e tests.',
        priceMinor: 5000,
        currency: 'USD',
      },
    });
    // DR-180: the guest add-ons step now only shows a package's explicitly
    // curated add-ons, not every org-active one -- without this link row,
    // the checkbox below never renders and the journey times out.
    await tx.packageAddonService.create({
      data: { organizationId: org.id, packageId: pkg.id, addonServiceId: visaAddon.id },
    });
    return { departureId: departure.id, visaAddonServiceId: visaAddon.id };
  });

  // DR-128: setAddons resolves the actual chargeable price from AddonRate
  // (country + code), not AddonService's own flat priceMinor/currency -- the
  // guest-checkout journey 409s at the Add-ons step without one. AddonRate
  // is platform-wide (not org-scoped), so this is find-or-create rather than
  // always-create, keeping repeated local runs against the same DB from
  // piling up duplicate NA/VISA_ASSISTANCE rows.
  const existingRate = await prisma.addonRate.findFirst({ where: { country: 'NA', code: 'VISA_ASSISTANCE' } });
  if (!existingRate) {
    await prisma.addonRate.create({ data: { country: 'NA', code: 'VISA_ASSISTANCE', priceMinor: 5000, currency: 'USD' } });
  }

  return { departureId, visaAddonServiceId };
}

/**
 * DR-115 incident regression fixture: a staff (TOUR_OPERATOR) user + a
 * DRAFT package with no priceMinor/durationDays -- attempting to publish it
 * through catalogService.updatePackage hits the DR-039 gate and throws a
 * real, expected ApiError (Errors.conflict) that must not crash the
 * /staff/packages/[packageId] page.
 */
export async function seedStaffAndUnpricedPackage(): Promise<{ staffUserId: string; packageId: string }> {
  const org = await prisma.organization.findFirstOrThrow({ where: { isPrimary: true } });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const staff = await prisma.user.create({
    data: { email: `e2e-catalog-staff-${suffix}@example.test`, role: 'TOUR_OPERATOR', organizationId: org.id, emailVerified: true },
  });

  const packageId = await withOrg(org.id, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: org.id,
        packageReference: testPackageReference(),
        title: `E2E Unpriced Fixture Safari ${suffix}`,
        description: 'Fixture for the DR-115 publish-without-price regression test.',
        country: 'NA',
        currency: 'USD',
        status: 'DRAFT',
      },
    });
    return pkg.id;
  });

  return { staffUserId: staff.id, packageId };
}

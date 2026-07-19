import { prisma, withOrg } from '../../src/lib/db';
import { formatPackageReference } from '@modules/catalog';

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
        status: 'PUBLISHED',
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
    return { departureId: departure.id, visaAddonServiceId: visaAddon.id };
  });

  return { departureId, visaAddonServiceId };
}

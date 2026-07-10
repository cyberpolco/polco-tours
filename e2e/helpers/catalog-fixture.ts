import { prisma, withOrg } from '../../src/lib/db';

/**
 * Seeds a published package + scheduled departure for guest-checkout e2e
 * assertions, decoupled from prisma/seed.ts's demo catalog content (which
 * may change independently of this test). Tenant-scoped tables MUST go
 * through withOrg -- RLS is live for the app under test, same as
 * booking-fixture.ts.
 */
export async function seedPublicDeparture(opts?: { capacity?: number }): Promise<{ departureId: string }> {
  const capacity = opts?.capacity ?? 2;
  const org = await prisma.organization.findFirstOrThrow({ where: { isPrimary: true } });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const departureId = await withOrg(org.id, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: org.id,
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
    return departure.id;
  });

  return { departureId };
}

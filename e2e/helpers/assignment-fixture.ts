import { prisma, withOrg } from '../../src/lib/db';

/**
 * Seeds a staff (TOUR_OPERATOR) user + a published package/departure + an
 * ACTIVE vehicle + an ACTIVE driver profile + a TOUR_GUIDE user, for
 * departures/assignment e2e assertions. Tenant-scoped tables MUST go
 * through withOrg -- same convention as booking-fixture.ts/fleet-fixture.ts.
 */
export async function seedStaffWithDepartureAndFleet(): Promise<{
  staffUserId: string;
  departureId: string;
  guideEmail: string;
}> {
  const org = await prisma.organization.findFirstOrThrow({ where: { isPrimary: true } });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const [staff, guide, driverUser] = await Promise.all([
    prisma.user.create({
      data: { email: `e2e-assign-staff-${suffix}@example.test`, role: 'TOUR_OPERATOR', organizationId: org.id, emailVerified: true },
    }),
    prisma.user.create({
      data: { email: `e2e-assign-guide-${suffix}@example.test`, role: 'TOUR_GUIDE', organizationId: org.id, emailVerified: true },
    }),
    prisma.user.create({
      data: { email: `e2e-assign-driver-${suffix}@example.test`, role: 'DRIVER', organizationId: org.id, emailVerified: true },
    }),
  ]);

  const departureId = await withOrg(org.id, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: org.id,
        title: `E2E Assignment Fixture Safari ${suffix}`,
        description: 'Fixture for departures/assignment e2e tests.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
        status: 'PUBLISHED',
      },
    });
    const departure = await tx.departure.create({
      data: { organizationId: org.id, tourPackageId: pkg.id, startDate: new Date('2026-09-01'), capacity: 5, status: 'SCHEDULED' },
    });
    await tx.vehicle.create({
      data: {
        organizationId: org.id,
        plateNumber: `E2E-${suffix}`,
        make: 'Toyota',
        model: 'Hilux',
        vehicleType: '4x4',
        seatCapacity: 5,
        status: 'ACTIVE',
      },
    });
    await tx.driverProfile.create({
      data: { organizationId: org.id, userId: driverUser.id, licenseNumber: `DL-${suffix}`, status: 'ACTIVE' },
    });
    return departure.id;
  });

  return { staffUserId: staff.id, departureId, guideEmail: guide.email };
}

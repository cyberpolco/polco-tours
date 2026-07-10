import { prisma } from '../../src/lib/db';

/**
 * Seeds a staff (TOUR_OPERATOR) user + a DRIVER-role user for fleet e2e
 * assertions, same withOrg-free-but-primary-org convention as
 * booking-fixture.ts (User isn't tenant-scoped by RLS the same way
 * package/departure/booking are -- organizationId is just a column here).
 */
export async function seedStaffForFleet(): Promise<{ staffUserId: string; driverUserId: string }> {
  const org = await prisma.organization.findFirstOrThrow({ where: { isPrimary: true } });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const [staff, driver] = await Promise.all([
    prisma.user.create({
      data: { email: `e2e-fleet-staff-${suffix}@example.test`, role: 'TOUR_OPERATOR', organizationId: org.id, emailVerified: true },
    }),
    prisma.user.create({
      data: { email: `e2e-fleet-driver-${suffix}@example.test`, role: 'DRIVER', organizationId: org.id, emailVerified: true },
    }),
  ]);

  return { staffUserId: staff.id, driverUserId: driver.id };
}

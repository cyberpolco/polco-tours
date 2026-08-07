import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../src/lib/db';
import { fleetService } from '../src/modules/fleet';

/**
 * DR-082: fleetService.recompute*Availability, the hook-driven half of the
 * fleet-availability feature (the other half, runAvailabilitySweep, is a
 * global cross-org sweep that isn't safe to run in an automated test
 * against the shared Neon DB -- it would flip any pre-existing, genuinely
 * stale seeded/demo row to INACTIVE as a side effect. Its pure logic
 * (computeAvailabilityStatus's 60-day threshold) is fully covered by
 * tests/fleet.domain.test.ts instead).
 */
const admin = new PrismaClient();

let orgId: string;
let otherOrgId: string;
let vehicleId: string;
let driverProfileId: string;
let guideUserId: string;

beforeAll(async () => {
  const [org, otherOrg] = await Promise.all([
    admin.organization.create({ data: { name: `FLEET-AVAIL-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' } }),
    admin.organization.create({ data: { name: `FLEET-AVAIL-OTHER-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' } }),
  ]);
  orgId = org.id;
  otherOrgId = otherOrg.id;

  const [driverUser, guideUser] = await Promise.all([
    admin.user.create({ data: { email: `driver-avail-${Date.now()}@example.test`, role: 'DRIVER', organizationId: orgId } }),
    admin.user.create({ data: { email: `guide-avail-${Date.now()}@example.test`, role: 'TOUR_GUIDE', organizationId: orgId } }),
  ]);
  guideUserId = guideUser.id;

  await withOrg(orgId, async (tx) => {
    const vehicle = await tx.vehicle.create({
      data: { organizationId: orgId, plateNumber: `AVAIL-${Date.now()}`, make: 'Toyota', model: 'Hilux', vehicleType: '4x4', seatCapacity: 5 },
    });
    vehicleId = vehicle.id;
    const driver = await tx.driverProfile.create({
      data: { organizationId: orgId, userId: driverUser.id, licenseNumber: `DL-AVAIL-${Date.now()}` },
    });
    driverProfileId = driver.id;
    await tx.guideProfile.create({ data: { organizationId: orgId, userId: guideUserId } });
  });
});

afterAll(async () => {
  if (!orgId || !otherOrgId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await withOrg(orgId, (tx) => tx.vehicle.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.driverProfile.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.guideProfile.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.deleteMany({ where: { id: { in: [orgId, otherOrgId] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('fleetService.recomputeVehicleAvailability', () => {
  it('defaults to AVAILABLE (schema default, freshly created)', async () => {
    const vehicle = await withOrg(orgId, (tx) => tx.vehicle.findUniqueOrThrow({ where: { id: vehicleId } }));
    expect(vehicle.availability).toBe('AVAILABLE');
  });

  it('flips to BOOKED and bumps lastActiveAt when isCurrentlyBooked is true', async () => {
    await fleetService.recomputeVehicleAvailability(orgId, vehicleId, true);
    const vehicle = await withOrg(orgId, (tx) => tx.vehicle.findUniqueOrThrow({ where: { id: vehicleId } }));
    expect(vehicle.availability).toBe('BOOKED');
    expect(vehicle.lastActiveAt.getTime()).toBeGreaterThan(Date.now() - 5000);
  });

  it('flips back to AVAILABLE (not INACTIVE) right after, since lastActiveAt was just bumped', async () => {
    await fleetService.recomputeVehicleAvailability(orgId, vehicleId, false);
    const vehicle = await withOrg(orgId, (tx) => tx.vehicle.findUniqueOrThrow({ where: { id: vehicleId } }));
    expect(vehicle.availability).toBe('AVAILABLE');
  });

  it('no-ops silently for a vehicle id that does not resolve in this org (cross-tenant, no throw)', async () => {
    await expect(fleetService.recomputeVehicleAvailability(otherOrgId, vehicleId, true)).resolves.toBeUndefined();
    const vehicle = await withOrg(orgId, (tx) => tx.vehicle.findUniqueOrThrow({ where: { id: vehicleId } }));
    expect(vehicle.availability).toBe('AVAILABLE'); // untouched by the cross-tenant call above
  });
});

describe('fleetService.recomputeDriverAvailability', () => {
  it('flips to BOOKED, keyed by driverProfileId', async () => {
    await fleetService.recomputeDriverAvailability(orgId, driverProfileId, true);
    const driver = await withOrg(orgId, (tx) => tx.driverProfile.findUniqueOrThrow({ where: { id: driverProfileId } }));
    expect(driver.availability).toBe('BOOKED');
  });
});

describe('fleetService.recomputeGuideAvailability', () => {
  it('flips to BOOKED, keyed by userId (not GuideProfile.id)', async () => {
    await fleetService.recomputeGuideAvailability(orgId, guideUserId, true);
    const guide = await withOrg(orgId, (tx) => tx.guideProfile.findUniqueOrThrow({ where: { userId: guideUserId } }));
    expect(guide.availability).toBe('BOOKED');
  });

  it('no-ops for a userId with no GuideProfile row at all', async () => {
    await expect(fleetService.recomputeGuideAvailability(orgId, '00000000-0000-0000-0000-000000000000', true)).resolves.toBeUndefined();
  });
});

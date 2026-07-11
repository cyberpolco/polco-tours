import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../src/lib/db';
import { fleetService } from '../src/modules/fleet';
import type { AuthContext } from '../src/modules/auth';

/**
 * listVehiclesByIds/listDriverProfilesByIds (DR-021) deliberately skip the
 * per-user ownership filter that getVehicle/getDriverProfile enforce -- the
 * "my schedule" self-service page calls them with vehicle/driver IDs already
 * scoped by the caller's own assignments, not arbitrary user input. Org
 * scoping must still hold (RLS is defense in depth, not the only gate), so
 * this asserts a caller in org A never gets org B's rows back even when
 * asked for both ids explicitly -- same anti-cross-tenant discipline as
 * tests/api/fleet.security.test.ts, just at the service layer since these
 * two methods have no dedicated API route.
 */
const admin = new PrismaClient();

let orgAId: string;
let orgBId: string;
let vehicleAId: string;
let vehicleBId: string;
let driverProfileAId: string;
let driverProfileBId: string;
let ctxOrgA: AuthContext;

beforeAll(async () => {
  const [orgA, orgB] = await Promise.all([
    admin.organization.create({ data: { name: `FLEET-BYIDS-A-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' } }),
    admin.organization.create({ data: { name: `FLEET-BYIDS-B-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' } }),
  ]);
  orgAId = orgA.id;
  orgBId = orgB.id;

  const [driverA] = await Promise.all([
    admin.user.create({ data: { email: `driver-a-${Date.now()}@example.test`, role: 'DRIVER', organizationId: orgAId } }),
  ]);

  await withOrg(orgAId, async (tx) => {
    const vehicle = await tx.vehicle.create({
      data: { organizationId: orgAId, plateNumber: 'ORG-A-VEH', make: 'Toyota', model: 'Hilux', vehicleType: '4x4', seatCapacity: 5 },
    });
    vehicleAId = vehicle.id;
    const profile = await tx.driverProfile.create({
      data: { organizationId: orgAId, userId: driverA.id, licenseNumber: 'DL-A' },
    });
    driverProfileAId = profile.id;
  });

  const driverBUser = await admin.user.create({
    data: { email: `driver-b-${Date.now()}@example.test`, role: 'DRIVER', organizationId: orgBId },
  });
  await withOrg(orgBId, async (tx) => {
    const vehicle = await tx.vehicle.create({
      data: { organizationId: orgBId, plateNumber: 'ORG-B-VEH', make: 'Toyota', model: 'Hilux', vehicleType: '4x4', seatCapacity: 5 },
    });
    vehicleBId = vehicle.id;
    const profile = await tx.driverProfile.create({
      data: { organizationId: orgBId, userId: driverBUser.id, licenseNumber: 'DL-B' },
    });
    driverProfileBId = profile.id;
  });

  ctxOrgA = { userId: driverA.id, role: 'DRIVER', organizationId: orgAId, sessionId: 's1', assignedCountry: null };
});

afterAll(async () => {
  await withOrg(orgAId, (tx) => tx.vehicle.deleteMany({ where: { organizationId: orgAId } }));
  await withOrg(orgAId, (tx) => tx.driverProfile.deleteMany({ where: { organizationId: orgAId } }));
  await withOrg(orgBId, (tx) => tx.vehicle.deleteMany({ where: { organizationId: orgBId } }));
  await withOrg(orgBId, (tx) => tx.driverProfile.deleteMany({ where: { organizationId: orgBId } }));
  await admin.user.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
  await admin.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('fleetService.listVehiclesByIds', () => {
  it("returns org A's vehicle but never org B's, even when both ids are requested", async () => {
    const result = await fleetService.listVehiclesByIds(ctxOrgA, [vehicleAId, vehicleBId]);
    expect(result.map((v) => v.id)).toEqual([vehicleAId]);
  });

  it('returns [] for an empty id list without querying', async () => {
    expect(await fleetService.listVehiclesByIds(ctxOrgA, [])).toEqual([]);
  });
});

describe('fleetService.listDriverProfilesByIds', () => {
  it("returns org A's driver profile but never org B's, even when both ids are requested", async () => {
    const result = await fleetService.listDriverProfilesByIds(ctxOrgA, [driverProfileAId, driverProfileBId]);
    expect(result.map((d) => d.id)).toEqual([driverProfileAId]);
  });
});

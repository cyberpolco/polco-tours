import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../src/lib/db';
import { fleetService } from '../src/modules/fleet';
import { ApiError } from '../src/lib/errors';
import type { AuthContext } from '../src/modules/auth/domain';
import type { Permission } from '../src/lib/rbac';

/**
 * DR-059: SUPERADMIN-only, real (soft) deletion of Vehicle/DriverProfile/
 * GuideProfile -- same two-layer pattern as bookingService.deleteBooking
 * (DR-058). Own throwaway org (not the shared primary org) since this test
 * creates/deletes fleet records directly via raw Prisma.
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;

let orgId: string;
let superadminId: string;
let operatorId: string;
let driverUserId: string;
let guideUserId: string;

function ctxFor(userId: string, roles: AuthContext['roles'], permissions: Permission[] = []): AuthContext {
  return {
    userId,
    roles,
    permissions: new Set(permissions),
    organizationId: orgId,
    sessionId: 'test-session',
    mustChangePassword: false,
  };
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `FLEET-DELETE-TEST-${suffix}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [superadmin, operator, driverUser, guideUser] = await Promise.all([
    admin.user.create({ data: { email: `fleet-delete-superadmin-${suffix}@example.test`, role: 'SUPERADMIN', organizationId: orgId } }),
    admin.user.create({ data: { email: `fleet-delete-operator-${suffix}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `fleet-delete-driver-${suffix}@example.test`, role: 'DRIVER', organizationId: orgId } }),
    admin.user.create({ data: { email: `fleet-delete-guide-${suffix}@example.test`, role: 'TOUR_GUIDE', organizationId: orgId } }),
  ]);
  superadminId = superadmin.id;
  operatorId = operator.id;
  driverUserId = driverUser.id;
  guideUserId = guideUser.id;
});

afterAll(async () => {
  if (!orgId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await withOrg(orgId, (tx) => tx.vehicle.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.driverProfile.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.guideProfile.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
}, 30_000);

describe('fleetService.deleteVehicle (DR-059)', () => {
  it('rejects a non-SUPERADMIN caller even with fleet.delete somehow in their permission set', async () => {
    const vehicle = await withOrg(orgId, (tx) =>
      tx.vehicle.create({
        data: { organizationId: orgId, plateNumber: `V-${suffix}-1`, make: 'Toyota', model: 'Hilux', vehicleType: '4x4', seatCapacity: 5 },
      }),
    );
    const ctx = ctxFor(operatorId, ['TOUR_OPERATOR'], ['fleet.delete']);
    const err = await fleetService.deleteVehicle(ctx, vehicle.id).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(403);

    const row = await withOrg(orgId, (tx) => tx.vehicle.findUnique({ where: { id: vehicle.id } }));
    expect(row?.deletedAt).toBeNull();
  });

  it('SUPERADMIN can soft-delete a vehicle, which then disappears from listVehicles', async () => {
    const vehicle = await withOrg(orgId, (tx) =>
      tx.vehicle.create({
        data: { organizationId: orgId, plateNumber: `V-${suffix}-2`, make: 'Toyota', model: 'Quantum', vehicleType: 'Minibus', seatCapacity: 14 },
      }),
    );
    const managerCtx = ctxFor(operatorId, ['TOUR_OPERATOR'], ['fleet.read']);
    const before = await fleetService.listVehicles(managerCtx);
    expect(before.some((v) => v.id === vehicle.id)).toBe(true);

    await fleetService.deleteVehicle(ctxFor(superadminId, ['SUPERADMIN']), vehicle.id);

    const after = await fleetService.listVehicles(managerCtx);
    expect(after.some((v) => v.id === vehicle.id)).toBe(false);

    const row = await withOrg(orgId, (tx) => tx.vehicle.findUnique({ where: { id: vehicle.id } }));
    expect(row).not.toBeNull();
    expect(row?.deletedAt).not.toBeNull();
  });
});

describe('fleetService.deleteDriverProfile (DR-059)', () => {
  it('SUPERADMIN can soft-delete a driver profile, which then disappears from listDriverProfiles', async () => {
    const driver = await withOrg(orgId, (tx) =>
      tx.driverProfile.create({ data: { organizationId: orgId, userId: driverUserId, licenseNumber: `DL-${suffix}` } }),
    );
    const managerCtx = ctxFor(operatorId, ['TOUR_OPERATOR'], ['fleet.read']);
    const before = await fleetService.listDriverProfiles(managerCtx);
    expect(before.some((d) => d.id === driver.id)).toBe(true);

    const rejected = await fleetService
      .deleteDriverProfile(ctxFor(operatorId, ['TOUR_OPERATOR'], ['fleet.delete']), driver.id)
      .catch((e) => e);
    expect(rejected).toBeInstanceOf(ApiError);
    expect((rejected as ApiError).status).toBe(403);

    await fleetService.deleteDriverProfile(ctxFor(superadminId, ['SUPERADMIN']), driver.id);

    const after = await fleetService.listDriverProfiles(managerCtx);
    expect(after.some((d) => d.id === driver.id)).toBe(false);
  });
});

describe('fleetService.deleteGuideProfile (DR-059)', () => {
  it('SUPERADMIN can soft-delete a guide profile, which then disappears from listGuideProfiles', async () => {
    const guide = await withOrg(orgId, (tx) => tx.guideProfile.create({ data: { organizationId: orgId, userId: guideUserId } }));
    const managerCtx = ctxFor(operatorId, ['TOUR_OPERATOR'], ['fleet.read']);
    const before = await fleetService.listGuideProfiles(managerCtx);
    expect(before.some((g) => g.id === guide.id)).toBe(true);

    await fleetService.deleteGuideProfile(ctxFor(superadminId, ['SUPERADMIN']), guide.id);

    const after = await fleetService.listGuideProfiles(managerCtx);
    expect(after.some((g) => g.id === guide.id)).toBe(false);
  });

  it('deleting an already-nonexistent guide profile 404s', async () => {
    const ctx = ctxFor(superadminId, ['SUPERADMIN']);
    await expect(fleetService.deleteGuideProfile(ctx, '00000000-0000-4000-8000-000000000000')).rejects.toThrow();
  });
});

describe('fleetService.deleteStarlinkKit (DR-059)', () => {
  it('rejects a non-SUPERADMIN caller even with fleet.delete somehow in their permission set', async () => {
    const kit = await withOrg(orgId, (tx) => tx.starlinkKit.create({ data: { organizationId: orgId, kitId: `KIT-${suffix}-1` } }));
    const err = await fleetService.deleteStarlinkKit(ctxFor(operatorId, ['TOUR_OPERATOR'], ['fleet.delete']), kit.id).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(403);

    const row = await withOrg(orgId, (tx) => tx.starlinkKit.findUnique({ where: { id: kit.id } }));
    expect(row).not.toBeNull(); // still there -- rejected, not deleted
  });

  it('SUPERADMIN can permanently delete a Starlink kit, which then disappears from listStarlinkKits', async () => {
    const kit = await withOrg(orgId, (tx) => tx.starlinkKit.create({ data: { organizationId: orgId, kitId: `KIT-${suffix}-2` } }));
    const managerCtx = ctxFor(operatorId, ['TOUR_OPERATOR'], ['fleet.read']);
    const before = await fleetService.listStarlinkKits(managerCtx);
    expect(before.some((k) => k.id === kit.id)).toBe(true);

    await fleetService.deleteStarlinkKit(ctxFor(superadminId, ['SUPERADMIN']), kit.id);

    const after = await fleetService.listStarlinkKits(managerCtx);
    expect(after.some((k) => k.id === kit.id)).toBe(false);

    // Real hard delete -- unlike Vehicle/DriverProfile/GuideProfile, the
    // row is genuinely gone, not just deletedAt-flagged.
    const row = await withOrg(orgId, (tx) => tx.starlinkKit.findUnique({ where: { id: kit.id } }));
    expect(row).toBeNull();
  });
});

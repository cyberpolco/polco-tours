import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../src/lib/db';
import { fleetService } from '../src/modules/fleet';
import type { AuthContext } from '../src/modules/auth/domain';

/**
 * DR-251 (explicit user request): the same person's spoken languages
 * shouldn't drift apart between their DriverProfile and GuideProfile when
 * they hold both (ROLE_COMPATIBILITY, DR-221, allows DRIVER+TOUR_GUIDE on
 * one account) -- updating either one's `languages` now syncs the other,
 * when it exists. Own throwaway org since this creates real fixture rows.
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;

let orgId: string;
let dualRoleUserId: string; // holds BOTH a DriverProfile and a GuideProfile
let driverOnlyUserId: string; // holds only a DriverProfile

function ctx(): AuthContext {
  return {
    userId: 'operator-fixture',
    roles: ['TOUR_OPERATOR'],
    permissions: new Set(['fleet.read', 'fleet.write']),
    organizationId: orgId,
    sessionId: 'test-session',
    mustChangePassword: false,
  };
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `FLEET-LANG-SYNC-TEST-${suffix}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [dualRoleUser, driverOnlyUser] = await Promise.all([
    admin.user.create({ data: { email: `dual-role-${suffix}@example.test`, role: 'DRIVER', organizationId: orgId } }),
    admin.user.create({ data: { email: `driver-only-${suffix}@example.test`, role: 'DRIVER', organizationId: orgId } }),
  ]);
  dualRoleUserId = dualRoleUser.id;
  driverOnlyUserId = driverOnlyUser.id;
});

afterAll(async () => {
  if (!orgId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await withOrg(orgId, (tx) => tx.driverProfile.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.guideProfile.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
}, 30_000);

describe('fleetService driver<->guide language sync (DR-251)', () => {
  it('updating a DriverProfile\'s languages syncs the same user\'s GuideProfile too', async () => {
    const driver = await fleetService.createDriverProfile(ctx(), { userId: dualRoleUserId, licenseNumber: 'DL-SYNC-1', languages: ['en'] });
    const guide = await fleetService.createGuideProfile(ctx(), { userId: dualRoleUserId, languages: ['en'] });

    await fleetService.updateDriverProfile(ctx(), driver.id, { languages: ['en', 'fr', 'af'] });

    const refreshedGuide = await fleetService.getGuideProfile(ctx(), guide.id);
    expect(refreshedGuide.languages.sort()).toEqual(['af', 'en', 'fr']);
  });

  it('updating a GuideProfile\'s languages syncs the same user\'s DriverProfile too', async () => {
    const driver = await fleetService.findDriverProfileByUserId(ctx(), dualRoleUserId);
    const guide = await fleetService.findGuideProfileByUserId(ctx(), dualRoleUserId);
    expect(driver).not.toBeNull();
    expect(guide).not.toBeNull();

    await fleetService.updateGuideProfile(ctx(), guide!.id, { languages: ['sw'] });

    const refreshedDriver = await fleetService.getDriverProfile(ctx(), driver!.id);
    expect(refreshedDriver.languages).toEqual(['sw']);
  });

  it('updating languages for a driver with no GuideProfile at all does not error', async () => {
    const driver = await fleetService.createDriverProfile(ctx(), { userId: driverOnlyUserId, licenseNumber: 'DL-SYNC-2', languages: ['en'] });
    await expect(fleetService.updateDriverProfile(ctx(), driver.id, { languages: ['en', 'de'] })).resolves.toMatchObject({
      languages: ['en', 'de'],
    });
  });

  it('updating a DriverProfile field OTHER than languages does not touch the sibling GuideProfile', async () => {
    const driver = await fleetService.findDriverProfileByUserId(ctx(), dualRoleUserId);
    const guide = await fleetService.findGuideProfileByUserId(ctx(), dualRoleUserId);
    const before = guide!.languages;

    await fleetService.updateDriverProfile(ctx(), driver!.id, { status: 'SUSPENDED' });

    const after = await fleetService.getGuideProfile(ctx(), guide!.id);
    expect(after.languages).toEqual(before);
  });
});

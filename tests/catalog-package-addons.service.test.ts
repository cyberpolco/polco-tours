import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { AuthContext } from '../src/modules/auth';
import { testPackageReference } from './helpers/package-reference';
import { withOrg, prisma } from '../src/lib/db';
import { catalogService } from '../src/modules/catalog';

/**
 * DR-180: per-package add-on curation (PackageAddonService). Covers the
 * happy path, the permission gate, and the anti-BOLA case of an
 * addonServiceId that doesn't belong to the caller's own org getting
 * silently dropped rather than linked.
 */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;
let packageAId: string;
let activeAddonAId: string;
let inactiveAddonAId: string;
let addonBId: string;

function ctxFor(organizationId: string, permissions: string[]): AuthContext {
  return {
    userId: 'staff-1',
    roles: ['TOUR_OPERATOR'],
    permissions: new Set(permissions) as AuthContext['permissions'],
    organizationId,
    sessionId: 'session-1',
    mustChangePassword: false,
  };
}

beforeAll(async () => {
  const [a, b] = await Promise.all([
    admin.organization.create({ data: { name: `DR180-A-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' } }),
    admin.organization.create({ data: { name: `DR180-B-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' } }),
  ]);
  orgA = a.id;
  orgB = b.id;

  await withOrg(orgA, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgA,
        packageReference: testPackageReference(),
        title: 'DR-180 fixture package',
        description: 'Fixture package for package-addon tests.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
      },
    });
    packageAId = pkg.id;
    const active = await tx.addonService.create({
      data: { organizationId: orgA, code: 'TRANSLATOR', name: 'Translator', description: 'Fixture.', priceMinor: 3000, currency: 'USD' },
    });
    activeAddonAId = active.id;
    const inactive = await tx.addonService.create({
      data: {
        organizationId: orgA,
        code: 'VIDEOGRAPHY',
        name: 'Videography',
        description: 'Fixture, deactivated.',
        priceMinor: 5000,
        currency: 'USD',
        active: false,
      },
    });
    inactiveAddonAId = inactive.id;
  });

  await withOrg(orgB, async (tx) => {
    const addon = await tx.addonService.create({
      data: { organizationId: orgB, code: 'TRANSLATOR', name: 'Translator (org B)', description: 'Fixture.', priceMinor: 3000, currency: 'USD' },
    });
    addonBId = addon.id;
  });
});

afterAll(async () => {
  if (!orgA || !orgB) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  for (const id of [orgA, orgB]) {
    await withOrg(id, (tx) => tx.packageAddonService.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.addonService.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: id } }));
  }
  await admin.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('catalogService package-addon curation (DR-180)', () => {
  it('rejects a caller without catalog.write', async () => {
    const ctx = ctxFor(orgA, ['catalog.read']);
    const err = await catalogService.setPackageAddons(ctx, packageAId, [activeAddonAId]).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/FORBIDDEN/);
  });

  it('links a valid, same-org add-on and surfaces it on the guest-facing list', async () => {
    const writer = ctxFor(orgA, ['catalog.read', 'catalog.write']);
    await catalogService.setPackageAddons(writer, packageAId, [activeAddonAId]);

    const ids = await catalogService.getPackageAddonServiceIds(writer, packageAId);
    expect(ids).toEqual([activeAddonAId]);

    const guestFacing = await catalogService.listAddonServicesForPackage(writer, packageAId);
    expect(guestFacing.map((a) => a.id)).toEqual([activeAddonAId]);
  });

  it('silently drops a cross-org addonServiceId instead of linking it (anti-BOLA)', async () => {
    const writer = ctxFor(orgA, ['catalog.read', 'catalog.write']);
    await catalogService.setPackageAddons(writer, packageAId, [activeAddonAId, addonBId]);

    const ids = await catalogService.getPackageAddonServiceIds(writer, packageAId);
    expect(ids).toEqual([activeAddonAId]);
    expect(ids).not.toContain(addonBId);
  });

  it('a since-deactivated selection stays linked but drops off the guest-facing list', async () => {
    const writer = ctxFor(orgA, ['catalog.read', 'catalog.write']);
    await catalogService.setPackageAddons(writer, packageAId, [activeAddonAId, inactiveAddonAId]);

    const ids = await catalogService.getPackageAddonServiceIds(writer, packageAId);
    expect(ids.sort()).toEqual([activeAddonAId, inactiveAddonAId].sort());

    const guestFacing = await catalogService.listAddonServicesForPackage(writer, packageAId);
    expect(guestFacing.map((a) => a.id)).toEqual([activeAddonAId]);
  });

  it('org B cannot set add-ons on org A\'s package (RLS-scoped lookup finds nothing)', async () => {
    const crossOrgWriter = ctxFor(orgB, ['catalog.read', 'catalog.write']);
    await expect(catalogService.setPackageAddons(crossOrgWriter, packageAId, [addonBId])).rejects.toThrow();
  });

  it('empty array clears every association', async () => {
    const writer = ctxFor(orgA, ['catalog.read', 'catalog.write']);
    await catalogService.setPackageAddons(writer, packageAId, [activeAddonAId]);
    await catalogService.setPackageAddons(writer, packageAId, []);

    const ids = await catalogService.getPackageAddonServiceIds(writer, packageAId);
    expect(ids).toEqual([]);
  });
});

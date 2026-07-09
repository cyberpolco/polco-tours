import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { withOrg, prisma } from '../src/lib/db';

/** Extends the RLS proof to the `addon_services` table added in DR-015
 * (org-scoped catalog, same family as tour_packages). */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;

async function seedOrgWithAddonService(name: string): Promise<string> {
  const org = await admin.organization.create({ data: { name, countries: ['NA'], status: 'VERIFIED' } });
  await withOrg(org.id, (tx) =>
    tx.addonService.create({
      data: {
        organizationId: org.id,
        code: 'PHOTOGRAPHY',
        name: 'Photography',
        description: 'Fixture add-on.',
        priceMinor: 5000,
        currency: 'USD',
      },
    }),
  );
  return org.id;
}

beforeAll(async () => {
  orgA = await seedOrgWithAddonService(`RLS-ADD-A-${Date.now()}`);
  orgB = await seedOrgWithAddonService(`RLS-ADD-B-${Date.now()}`);
});

afterAll(async () => {
  for (const id of [orgA, orgB]) {
    await withOrg(id, (tx) => tx.addonService.deleteMany({ where: { organizationId: id } }));
  }
  await admin.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('Row-Level Security: addon_services tenant isolation', () => {
  it('org A sees only its own add-on services', async () => {
    const rows = await withOrg(orgA, (tx) => tx.addonService.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A add-on services', async () => {
    const rows = await withOrg(orgB, (tx) => tx.addonService.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.addonService.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write an add-on service into another tenant (WITH CHECK)', async () => {
    await expect(
      withOrg(orgB, (tx) =>
        tx.addonService.create({
          data: {
            organizationId: orgA,
            code: 'TRANSLATOR',
            name: 'Hostile write',
            description: 'Should be rejected.',
            priceMinor: 100,
            currency: 'USD',
          },
        }),
      ),
    ).rejects.toThrow();
  });
});

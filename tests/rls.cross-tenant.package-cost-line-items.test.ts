import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { formatPackageReference } from '@modules/catalog';
import { withOrg, prisma } from '../src/lib/db';

/** Extends the RLS proof to the `package_cost_line_items` table added in DR-039. */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;

async function seedOrgWithLineItem(name: string): Promise<{ orgId: string; breakdownId: string }> {
  const org = await admin.organization.create({ data: { name, countries: ['NA'], status: 'VERIFIED' } });
  let breakdownId = '';
  await withOrg(org.id, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: org.id,
        packageReference: formatPackageReference(Date.now()),
        title: `RLS-PCLI-${name}`,
        description: 'Fixture package for cost-line-item RLS test.',
        country: 'NA',
        currency: 'USD',
        status: 'DRAFT',
      },
    });
    const breakdown = await tx.packageCostBreakdown.create({
      data: {
        organizationId: org.id,
        tourPackageId: pkg.id,
        currency: 'USD',
        referenceGroupSize: 10,
        nights: 1,
        driverDays: 0,
        guideDays: 0,
        agencyMarginBp: 0,
      },
    });
    breakdownId = breakdown.id;
    const foodRate = await admin.foodBeverageRate.create({
      data: { country: 'NA', category: 'WATER', perUnitMinor: 200, currency: 'USD' },
    });
    await tx.packageCostLineItem.create({
      data: {
        organizationId: org.id,
        packageCostBreakdownId: breakdown.id,
        foodBeverageRateId: foodRate.id,
        quantityPerPerson: 2,
      },
    });
  });
  return { orgId: org.id, breakdownId };
}

beforeAll(async () => {
  const [a, b] = await Promise.all([
    seedOrgWithLineItem(`RLS-PCLI-A-${Date.now()}`),
    seedOrgWithLineItem(`RLS-PCLI-B-${Date.now()}`),
  ]);
  orgA = a.orgId;
  orgB = b.orgId;
});

afterAll(async () => {
  // Guard: if beforeAll failed before orgA/orgB were assigned, Prisma
  // silently drops the undefined where-clause value, turning cleanup into
  // an unscoped deleteMany that wipes the whole table -- this has hit real
  // production data twice. Skip cleanup entirely rather than risk it.
  if (!orgA || !orgB) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  for (const id of [orgA, orgB]) {
    await withOrg(id, (tx) => tx.packageCostLineItem.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.packageCostBreakdown.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: id } }));
  }
  await admin.foodBeverageRate.deleteMany({ where: { country: 'NA', category: 'WATER', perUnitMinor: 200 } });
  await admin.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('Row-Level Security: package_cost_line_items tenant isolation', () => {
  it('org A sees only its own line item', async () => {
    const rows = await withOrg(orgA, (tx) => tx.packageCostLineItem.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A line item', async () => {
    const rows = await withOrg(orgB, (tx) => tx.packageCostLineItem.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.packageCostLineItem.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write a line item into another tenant (WITH CHECK)', async () => {
    const breakdownInOrgA = await withOrg(orgA, (tx) => tx.packageCostBreakdown.findFirstOrThrow());
    await expect(
      withOrg(orgA, (tx) =>
        tx.packageCostLineItem.create({
          data: {
            organizationId: orgB,
            packageCostBreakdownId: breakdownInOrgA.id,
            quantityPerPerson: 1,
          },
        }),
      ),
    ).rejects.toThrow();
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { formatPackageReference } from '@modules/catalog';
import { withOrg, prisma } from '../src/lib/db';

/** Extends the RLS proof to the `package_cost_breakdowns` table added in DR-039. */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;

async function seedOrgWithBreakdown(name: string): Promise<string> {
  const org = await admin.organization.create({ data: { name, countries: ['NA'], status: 'VERIFIED' } });
  await withOrg(org.id, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: org.id,
        packageReference: formatPackageReference(Date.now()),
        title: `RLS-PCB-${name}`,
        description: 'Fixture package for cost-breakdown RLS test.',
        country: 'NA',
        currency: 'USD',
        status: 'DRAFT',
      },
    });
    await tx.packageCostBreakdown.create({
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
  });
  return org.id;
}

beforeAll(async () => {
  const [a, b] = await Promise.all([
    seedOrgWithBreakdown(`RLS-PCB-A-${Date.now()}`),
    seedOrgWithBreakdown(`RLS-PCB-B-${Date.now()}`),
  ]);
  orgA = a;
  orgB = b;
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
    await withOrg(id, (tx) => tx.packageCostBreakdown.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: id } }));
  }
  await admin.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('Row-Level Security: package_cost_breakdowns tenant isolation', () => {
  it('org A sees only its own cost breakdown', async () => {
    const rows = await withOrg(orgA, (tx) => tx.packageCostBreakdown.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A cost breakdown', async () => {
    const rows = await withOrg(orgB, (tx) => tx.packageCostBreakdown.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.packageCostBreakdown.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write a cost breakdown into another tenant (WITH CHECK)', async () => {
    const pkgInOrgA = await withOrg(orgA, (tx) => tx.tourPackage.findFirstOrThrow());
    await expect(
      withOrg(orgA, (tx) =>
        tx.packageCostBreakdown.create({
          data: {
            organizationId: orgB,
            tourPackageId: pkgInOrgA.id,
            currency: 'USD',
            referenceGroupSize: 10,
            nights: 1,
            driverDays: 0,
            guideDays: 0,
            agencyMarginBp: 0,
          },
        }),
      ),
    ).rejects.toThrow();
  });
});

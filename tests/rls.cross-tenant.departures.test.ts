import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { formatPackageReference } from '@modules/catalog';
import { PrismaClient } from '@prisma/client';
import { withOrg, prisma } from '../src/lib/db';

/**
 * Extends the Phase 0 RLS proof (tests/rls.cross-tenant.test.ts) to the
 * `departures` table added in Phase 1 Increment 1. Same contract: a query
 * scoped to one org can never see another org's rows, and deny-by-default
 * holds with no scope set.
 */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;

async function seedOrgWithDeparture(name: string): Promise<string> {
  const org = await admin.organization.create({
    data: { name, countries: ['NA'], status: 'VERIFIED' },
  });
  await withOrg(org.id, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: org.id,
        packageReference: formatPackageReference(Date.now()),
        title: `${name} Safari`,
        description: 'Cross-tenant RLS fixture package.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
      },
    });
    await tx.departure.create({
      data: {
        organizationId: org.id,
        tourPackageId: pkg.id,
        startDate: new Date('2026-08-01'),
        capacity: 10,
      },
    });
  });
  return org.id;
}

beforeAll(async () => {
  orgA = await seedOrgWithDeparture(`RLS-DEP-A-${Date.now()}`);
  orgB = await seedOrgWithDeparture(`RLS-DEP-B-${Date.now()}`);
});

afterAll(async () => {
  for (const id of [orgA, orgB]) {
    await withOrg(id, (tx) => tx.departure.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: id } }));
  }
  await admin.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('Row-Level Security: departures tenant isolation', () => {
  it('org A sees only its own departures', async () => {
    const rows = await withOrg(orgA, (tx) => tx.departure.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A departures', async () => {
    const rows = await withOrg(orgB, (tx) => tx.departure.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.departure.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write a departure into another tenant (WITH CHECK)', async () => {
    const orgAPkg = await withOrg(orgA, (tx) => tx.tourPackage.findFirstOrThrow());
    await expect(
      withOrg(orgB, (tx) =>
        tx.departure.create({
          data: {
            organizationId: orgA,
            tourPackageId: orgAPkg.id,
            startDate: new Date('2026-08-01'),
            capacity: 5,
          },
        }),
      ),
    ).rejects.toThrow();
  });
});

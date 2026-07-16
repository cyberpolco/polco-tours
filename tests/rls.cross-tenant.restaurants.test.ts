import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { withOrg, prisma } from '../src/lib/db';

/** Extends the RLS proof to the `restaurants` table added in DR-033. */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;

async function seedOrgWithRestaurant(name: string): Promise<string> {
  const org = await admin.organization.create({ data: { name, countries: ['NA'], status: 'VERIFIED' } });
  await withOrg(org.id, (tx) =>
    tx.restaurant.create({ data: { organizationId: org.id, name: 'Fixture Restaurant', country: 'NA' } }),
  );
  return org.id;
}

beforeAll(async () => {
  orgA = await seedOrgWithRestaurant(`RLS-RESTAURANT-A-${Date.now()}`);
  orgB = await seedOrgWithRestaurant(`RLS-RESTAURANT-B-${Date.now()}`);
});

afterAll(async () => {
  for (const id of [orgA, orgB]) {
    await withOrg(id, (tx) => tx.restaurant.deleteMany({ where: { organizationId: id } }));
  }
  await admin.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('Row-Level Security: restaurants tenant isolation', () => {
  it('org A sees only its own restaurants', async () => {
    const rows = await withOrg(orgA, (tx) => tx.restaurant.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A restaurants', async () => {
    const rows = await withOrg(orgB, (tx) => tx.restaurant.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.restaurant.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write a restaurant into another tenant (WITH CHECK)', async () => {
    await expect(
      withOrg(orgA, (tx) =>
        tx.restaurant.create({ data: { organizationId: orgB, name: 'Hostile Restaurant', country: 'NA' } }),
      ),
    ).rejects.toThrow();
  });
});

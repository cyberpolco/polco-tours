import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { withOrg, prisma } from '../src/lib/db';

/** Extends the RLS proof to the `hotels` table added in DR-033. */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;

async function seedOrgWithHotel(name: string): Promise<string> {
  const org = await admin.organization.create({ data: { name, countries: ['NA'], status: 'VERIFIED' } });
  await withOrg(org.id, (tx) => tx.hotel.create({ data: { organizationId: org.id, name: 'Fixture Hotel', country: 'NA' } }));
  return org.id;
}

beforeAll(async () => {
  orgA = await seedOrgWithHotel(`RLS-HOTEL-A-${Date.now()}`);
  orgB = await seedOrgWithHotel(`RLS-HOTEL-B-${Date.now()}`);
});

afterAll(async () => {
  for (const id of [orgA, orgB]) {
    await withOrg(id, (tx) => tx.hotel.deleteMany({ where: { organizationId: id } }));
  }
  await admin.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('Row-Level Security: hotels tenant isolation', () => {
  it('org A sees only its own hotels', async () => {
    const rows = await withOrg(orgA, (tx) => tx.hotel.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A hotels', async () => {
    const rows = await withOrg(orgB, (tx) => tx.hotel.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.hotel.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write a hotel into another tenant (WITH CHECK)', async () => {
    await expect(
      withOrg(orgA, (tx) => tx.hotel.create({ data: { organizationId: orgB, name: 'Hostile Hotel', country: 'NA' } })),
    ).rejects.toThrow();
  });
});

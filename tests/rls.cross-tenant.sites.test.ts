import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { withOrg, prisma } from '../src/lib/db';

/** Extends the RLS proof to the `sites` table added in DR-083. */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;

async function seedOrgWithSite(name: string): Promise<string> {
  const org = await admin.organization.create({ data: { name, countries: ['NA'], status: 'VERIFIED' } });
  await withOrg(org.id, (tx) => tx.site.create({ data: { organizationId: org.id, name: 'Fixture Site', country: 'NA', province: 'Khomas' } }));
  return org.id;
}

beforeAll(async () => {
  orgA = await seedOrgWithSite(`RLS-SITE-A-${Date.now()}`);
  orgB = await seedOrgWithSite(`RLS-SITE-B-${Date.now()}`);
});

afterAll(async () => {
  // Guard: if beforeAll failed before orgA/orgB were assigned, Prisma silently
  // drops the undefined where-clause value, turning cleanup into an unscoped
  // deleteMany that wipes the whole table -- this has hit real production
  // data twice. Skip cleanup entirely rather than risk it.
  if (!orgA || !orgB) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  for (const id of [orgA, orgB]) {
    await withOrg(id, (tx) => tx.site.deleteMany({ where: { organizationId: id } }));
  }
  await admin.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('Row-Level Security: sites tenant isolation', () => {
  it('org A sees only its own sites', async () => {
    const rows = await withOrg(orgA, (tx) => tx.site.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A sites', async () => {
    const rows = await withOrg(orgB, (tx) => tx.site.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.site.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write a site into another tenant (WITH CHECK)', async () => {
    await expect(
      withOrg(orgA, (tx) => tx.site.create({ data: { organizationId: orgB, name: 'Hostile Site', country: 'NA', province: 'Khomas' } })),
    ).rejects.toThrow();
  });
});

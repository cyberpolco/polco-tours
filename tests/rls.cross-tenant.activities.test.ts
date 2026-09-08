import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { withOrg, prisma } from '../src/lib/db';

/** Extends the RLS proof to the `site_activities` table added in DR-116. */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;

async function seedOrgWithActivity(name: string): Promise<string> {
  const org = await admin.organization.create({ data: { name, countries: ['NA'], status: 'VERIFIED' } });
  await withOrg(org.id, async (tx) => {
    const site = await tx.site.create({ data: { organizationId: org.id, name: 'Fixture Site', country: 'NA', province: 'Khomas' } });
    await tx.activity.create({ data: { organizationId: org.id, siteId: site.id, name: 'Fixture Activity' } });
  });
  return org.id;
}

beforeAll(async () => {
  orgA = await seedOrgWithActivity(`RLS-ACTIVITY-A-${Date.now()}`);
  orgB = await seedOrgWithActivity(`RLS-ACTIVITY-B-${Date.now()}`);
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
    await withOrg(id, (tx) => tx.activity.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.site.deleteMany({ where: { organizationId: id } }));
  }
  await admin.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('Row-Level Security: site_activities tenant isolation', () => {
  it('org A sees only its own activities', async () => {
    const rows = await withOrg(orgA, (tx) => tx.activity.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A activities', async () => {
    const rows = await withOrg(orgB, (tx) => tx.activity.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.activity.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write an activity into another tenant (WITH CHECK)', async () => {
    const siteA = await withOrg(orgA, (tx) => tx.site.findFirstOrThrow({ where: { organizationId: orgA } }));
    await expect(
      withOrg(orgA, (tx) => tx.activity.create({ data: { organizationId: orgB, siteId: siteA.id, name: 'Hostile Activity' } })),
    ).rejects.toThrow();
  });
});

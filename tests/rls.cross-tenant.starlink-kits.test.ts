import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { withOrg, prisma } from '../src/lib/db';

/** Extends the RLS proof to the `starlink_kits` table added in DR-029. */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;

async function seedOrgWithStarlinkKit(name: string, kitId: string): Promise<string> {
  const org = await admin.organization.create({ data: { name, countries: ['NA'], status: 'VERIFIED' } });
  await withOrg(org.id, (tx) => tx.starlinkKit.create({ data: { organizationId: org.id, kitId } }));
  return org.id;
}

beforeAll(async () => {
  orgA = await seedOrgWithStarlinkKit(`RLS-STARLINK-A-${Date.now()}`, `KIT-A-${Date.now()}`);
  orgB = await seedOrgWithStarlinkKit(`RLS-STARLINK-B-${Date.now()}`, `KIT-B-${Date.now()}`);
});

afterAll(async () => {
  // Guard: if beforeAll failed before orgA/orgB were assigned, Prisma silently
  // drops the undefined where-clause value, turning this into an unscoped
  // deleteMany that wipes the whole table -- this has hit real production
  // data twice. Skip cleanup entirely rather than risk it.
  if (!orgA || !orgB) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  for (const id of [orgA, orgB]) {
    await withOrg(id, (tx) => tx.starlinkKit.deleteMany({ where: { organizationId: id } }));
  }
  await admin.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('Row-Level Security: starlink_kits tenant isolation', () => {
  it('org A sees only its own Starlink kits', async () => {
    const rows = await withOrg(orgA, (tx) => tx.starlinkKit.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A Starlink kits', async () => {
    const rows = await withOrg(orgB, (tx) => tx.starlinkKit.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.starlinkKit.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write a Starlink kit into another tenant (WITH CHECK)', async () => {
    await expect(
      withOrg(orgB, (tx) =>
        tx.starlinkKit.create({ data: { organizationId: orgA, kitId: `HOSTILE-${Date.now()}` } }),
      ),
    ).rejects.toThrow();
  });
});

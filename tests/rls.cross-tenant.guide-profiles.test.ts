import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { withOrg, prisma } from '../src/lib/db';

/** Extends the RLS proof to the `guide_profiles` table added in DR-030. */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;

async function seedOrgWithGuideProfile(name: string): Promise<string> {
  const org = await admin.organization.create({ data: { name, countries: ['NA'], status: 'VERIFIED' } });
  const user = await admin.user.create({
    data: { email: `guide-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`, role: 'TOUR_GUIDE', organizationId: org.id },
  });
  await withOrg(org.id, (tx) => tx.guideProfile.create({ data: { organizationId: org.id, userId: user.id } }));
  return org.id;
}

beforeAll(async () => {
  orgA = await seedOrgWithGuideProfile(`RLS-GUIDE-A-${Date.now()}`);
  orgB = await seedOrgWithGuideProfile(`RLS-GUIDE-B-${Date.now()}`);
});

afterAll(async () => {
  for (const id of [orgA, orgB]) {
    await withOrg(id, (tx) => tx.guideProfile.deleteMany({ where: { organizationId: id } }));
    await admin.user.deleteMany({ where: { organizationId: id } });
  }
  await admin.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('Row-Level Security: guide_profiles tenant isolation', () => {
  it('org A sees only its own guide profiles', async () => {
    const rows = await withOrg(orgA, (tx) => tx.guideProfile.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A guide profiles', async () => {
    const rows = await withOrg(orgB, (tx) => tx.guideProfile.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.guideProfile.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write a guide profile into another tenant (WITH CHECK)', async () => {
    // A fresh user (not already profiled) so the failure is unambiguously the
    // RLS WITH CHECK, not the userId @unique constraint.
    const hostileUser = await admin.user.create({
      data: { email: `hostile-guide-${Date.now()}@example.test`, role: 'TOUR_GUIDE', organizationId: orgB },
    });
    await expect(
      withOrg(orgA, (tx) =>
        tx.guideProfile.create({ data: { organizationId: orgB, userId: hostileUser.id } }),
      ),
    ).rejects.toThrow();
  });
});

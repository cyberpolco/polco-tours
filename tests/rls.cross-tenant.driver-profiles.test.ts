import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { withOrg, prisma } from '../src/lib/db';

/** Extends the RLS proof to the `driver_profiles` table added in DR-017 (fleet + compliance). */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;
let userAId: string;
let userBId: string;

async function seedOrgWithDriverProfile(name: string): Promise<{ orgId: string; userId: string }> {
  const org = await admin.organization.create({ data: { name, countries: ['NA'], status: 'VERIFIED' } });
  const user = await admin.user.create({
    data: { email: `${name.toLowerCase()}@example.test`, role: 'DRIVER', organizationId: org.id },
  });
  await withOrg(org.id, (tx) =>
    tx.driverProfile.create({
      data: { organizationId: org.id, userId: user.id, licenseNumber: 'DL-FIXTURE' },
    }),
  );
  return { orgId: org.id, userId: user.id };
}

beforeAll(async () => {
  const a = await seedOrgWithDriverProfile(`RLS-DRV-A-${Date.now()}`);
  const b = await seedOrgWithDriverProfile(`RLS-DRV-B-${Date.now()}`);
  orgA = a.orgId;
  orgB = b.orgId;
  userAId = a.userId;
  userBId = b.userId;
});

afterAll(async () => {
  for (const id of [orgA, orgB]) {
    await withOrg(id, (tx) => tx.driverProfile.deleteMany({ where: { organizationId: id } }));
  }
  await admin.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  await admin.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('Row-Level Security: driver_profiles tenant isolation', () => {
  it('org A sees only its own driver profiles', async () => {
    const rows = await withOrg(orgA, (tx) => tx.driverProfile.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A driver profiles', async () => {
    const rows = await withOrg(orgB, (tx) => tx.driverProfile.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.driverProfile.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write a driver profile into another tenant (WITH CHECK)', async () => {
    await expect(
      withOrg(orgB, (tx) =>
        tx.driverProfile.create({
          data: { organizationId: orgA, userId: userBId, licenseNumber: 'HOSTILE' },
        }),
      ),
    ).rejects.toThrow();
  });
});

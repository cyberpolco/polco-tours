import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { withOrg, prisma } from '../src/lib/db';

/** Extends the RLS proof to the `vehicles` table added in DR-017 (fleet + compliance). */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;

async function seedOrgWithVehicle(name: string): Promise<string> {
  const org = await admin.organization.create({ data: { name, countries: ['NA'], status: 'VERIFIED' } });
  await withOrg(org.id, (tx) =>
    tx.vehicle.create({
      data: {
        organizationId: org.id,
        plateNumber: 'N-FIXTURE',
        make: 'Toyota',
        model: 'Hilux',
        vehicleType: '4x4',
        seatCapacity: 5,
      },
    }),
  );
  return org.id;
}

beforeAll(async () => {
  orgA = await seedOrgWithVehicle(`RLS-VEH-A-${Date.now()}`);
  orgB = await seedOrgWithVehicle(`RLS-VEH-B-${Date.now()}`);
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
    await withOrg(id, (tx) => tx.vehicle.deleteMany({ where: { organizationId: id } }));
  }
  await admin.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('Row-Level Security: vehicles tenant isolation', () => {
  it('org A sees only its own vehicles', async () => {
    const rows = await withOrg(orgA, (tx) => tx.vehicle.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A vehicles', async () => {
    const rows = await withOrg(orgB, (tx) => tx.vehicle.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.vehicle.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write a vehicle into another tenant (WITH CHECK)', async () => {
    await expect(
      withOrg(orgB, (tx) =>
        tx.vehicle.create({
          data: {
            organizationId: orgA,
            plateNumber: 'HOSTILE',
            make: 'Hostile',
            model: 'Write',
            vehicleType: 'sedan',
            seatCapacity: 4,
          },
        }),
      ),
    ).rejects.toThrow();
  });
});

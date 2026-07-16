import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { withOrg, prisma } from '../src/lib/db';

/** Extends the RLS proof to the `maintenance_records` table added in DR-029. */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;

async function seedOrgWithMaintenanceRecord(name: string): Promise<string> {
  const org = await admin.organization.create({ data: { name, countries: ['NA'], status: 'VERIFIED' } });
  await withOrg(org.id, async (tx) => {
    const vehicle = await tx.vehicle.create({
      data: { organizationId: org.id, plateNumber: 'N-FIXTURE', make: 'Toyota', model: 'Hilux', vehicleType: '4x4', seatCapacity: 5 },
    });
    await tx.maintenanceRecord.create({
      data: { organizationId: org.id, vehicleId: vehicle.id, performedAt: new Date('2026-01-01'), description: 'Oil change' },
    });
  });
  return org.id;
}

beforeAll(async () => {
  orgA = await seedOrgWithMaintenanceRecord(`RLS-MAINT-A-${Date.now()}`);
  orgB = await seedOrgWithMaintenanceRecord(`RLS-MAINT-B-${Date.now()}`);
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
    await withOrg(id, (tx) => tx.maintenanceRecord.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.vehicle.deleteMany({ where: { organizationId: id } }));
  }
  await admin.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('Row-Level Security: maintenance_records tenant isolation', () => {
  it('org A sees only its own maintenance records', async () => {
    const rows = await withOrg(orgA, (tx) => tx.maintenanceRecord.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A maintenance records', async () => {
    const rows = await withOrg(orgB, (tx) => tx.maintenanceRecord.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.maintenanceRecord.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write a maintenance record into another tenant (WITH CHECK)', async () => {
    const orgAVehicle = await withOrg(orgA, (tx) => tx.vehicle.findFirstOrThrow());
    await expect(
      withOrg(orgB, (tx) =>
        tx.maintenanceRecord.create({
          data: { organizationId: orgA, vehicleId: orgAVehicle.id, performedAt: new Date(), description: 'Hostile write' },
        }),
      ),
    ).rejects.toThrow();
  });
});

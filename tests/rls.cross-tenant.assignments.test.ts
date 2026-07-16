import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { formatPackageReference } from '@modules/catalog';
import { PrismaClient } from '@prisma/client';
import { withOrg, prisma } from '../src/lib/db';

/** Extends the RLS proof to the `assignments` table added in DR-018. */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;

async function seedOrgWithAssignment(name: string): Promise<string> {
  const org = await admin.organization.create({ data: { name, countries: ['NA'], status: 'VERIFIED' } });
  const driverUser = await admin.user.create({
    data: { email: `${name.toLowerCase()}-driver@example.test`, role: 'DRIVER', organizationId: org.id },
  });

  await withOrg(org.id, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: org.id,
        packageReference: formatPackageReference(Date.now()),
        title: 'RLS Fixture Safari',
        description: 'Fixture for assignment RLS tests.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
        status: 'PUBLISHED',
      },
    });
    const departure = await tx.departure.create({
      data: { organizationId: org.id, tourPackageId: pkg.id, startDate: new Date('2026-09-01'), capacity: 5, status: 'SCHEDULED' },
    });
    const vehicle = await tx.vehicle.create({
      data: { organizationId: org.id, plateNumber: 'RLS-FIXTURE', make: 'Toyota', model: 'Hilux', vehicleType: '4x4', seatCapacity: 5 },
    });
    const driverProfile = await tx.driverProfile.create({
      data: { organizationId: org.id, userId: driverUser.id, licenseNumber: 'DL-RLS-FIXTURE' },
    });
    await tx.assignment.create({
      data: { organizationId: org.id, departureId: departure.id, vehicleId: vehicle.id, driverProfileId: driverProfile.id },
    });
  });

  return org.id;
}

beforeAll(async () => {
  orgA = await seedOrgWithAssignment(`RLS-ASSIGN-A-${Date.now()}`);
  orgB = await seedOrgWithAssignment(`RLS-ASSIGN-B-${Date.now()}`);
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
    await withOrg(id, (tx) => tx.assignment.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.driverProfile.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.vehicle.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.departure.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: id } }));
  }
  await admin.user.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await admin.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('Row-Level Security: assignments tenant isolation', () => {
  it('org A sees only its own assignments', async () => {
    const rows = await withOrg(orgA, (tx) => tx.assignment.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A assignments', async () => {
    const rows = await withOrg(orgB, (tx) => tx.assignment.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.assignment.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write an assignment into another tenant (WITH CHECK)', async () => {
    const orgAVehicle = await withOrg(orgA, (tx) => tx.vehicle.findFirstOrThrow());
    const orgADeparture = await withOrg(orgA, (tx) => tx.departure.findFirstOrThrow());
    const orgADriverProfile = await withOrg(orgA, (tx) => tx.driverProfile.findFirstOrThrow());

    await expect(
      withOrg(orgB, (tx) =>
        tx.assignment.create({
          data: {
            organizationId: orgA,
            departureId: orgADeparture.id,
            vehicleId: orgAVehicle.id,
            driverProfileId: orgADriverProfile.id,
          },
        }),
      ),
    ).rejects.toThrow();
  });
});

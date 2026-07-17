import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { formatPackageReference } from '@modules/catalog';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { GET as getTracking } from '../../src/app/api/v1/tracking/route';

/**
 * Role-gate + cross-tenant coverage for the new DR-041 route: a role
 * without tracking.read (e.g. DRIVER) must be denied, and an operator from
 * a DIFFERENT org must never see another org's fleet/trip data reflected in
 * their own snapshot.
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;

let orgAId: string;
let orgBId: string;
let operatorAId: string;
let operatorBId: string;
let driverAId: string;

beforeAll(async () => {
  const [orgA, orgB] = await Promise.all([
    admin.organization.create({ data: { name: `TRACKING-SEC-A-${suffix}`, countries: ['NA'], status: 'VERIFIED' } }),
    admin.organization.create({ data: { name: `TRACKING-SEC-B-${suffix}`, countries: ['NA'], status: 'VERIFIED' } }),
  ]);
  orgAId = orgA.id;
  orgBId = orgB.id;

  const [operatorA, operatorB, driverA] = await Promise.all([
    admin.user.create({ data: { email: `op-a-tracking-sec-${suffix}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgAId } }),
    admin.user.create({ data: { email: `op-b-tracking-sec-${suffix}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgBId } }),
    admin.user.create({ data: { email: `driver-a-tracking-sec-${suffix}@example.test`, role: 'DRIVER', organizationId: orgAId } }),
  ]);
  operatorAId = operatorA.id;
  operatorBId = operatorB.id;
  driverAId = driverA.id;

  await withOrg(orgAId, async (tx) => {
    const vehicle = await tx.vehicle.create({
      data: { organizationId: orgAId, plateNumber: `TRKSEC-${suffix}`, make: 'Toyota', model: 'Hilux', vehicleType: '4x4', seatCapacity: 4 },
    });
    await tx.starlinkKit.create({
      data: { organizationId: orgAId, kitId: `KITSEC-${suffix}`, vehicleId: vehicle.id, lastLatitude: -22.5, lastLongitude: 17.1, lastLocationAt: new Date() },
    });
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgAId,
        packageReference: formatPackageReference(Date.now()),
        title: `TEST-TRACKING-SEC-${suffix}`,
        description: 'Fixture.',
        country: 'NA',
        priceMinor: 100000,
        currency: 'USD',
        status: 'PUBLISHED',
      },
    });
    const driverProfile = await tx.driverProfile.create({
      data: { organizationId: orgAId, userId: driverAId, licenseNumber: `LICSEC-${suffix}` },
    });
    const departure = await tx.departure.create({
      data: { organizationId: orgAId, tourPackageId: pkg.id, startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), capacity: 4 },
    });
    await tx.assignment.create({
      data: { organizationId: orgAId, departureId: departure.id, vehicleId: vehicle.id, driverProfileId: driverProfile.id },
    });
  });
});

afterAll(async () => {
  // Guard: if beforeAll failed before either org id was assigned, Prisma
  // silently drops the undefined where-clause value, turning cleanup into
  // an unscoped deleteMany that wipes the whole table -- this has hit real
  // production data twice. Skip cleanup entirely rather than risk it.
  if (!orgAId || !orgBId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await withOrg(orgAId, async (tx) => {
    await tx.assignment.deleteMany({ where: { organizationId: orgAId } });
    await tx.departure.deleteMany({ where: { organizationId: orgAId } });
    await tx.tourPackage.deleteMany({ where: { organizationId: orgAId } });
    await tx.starlinkKit.deleteMany({ where: { organizationId: orgAId } });
    await tx.vehicle.deleteMany({ where: { organizationId: orgAId } });
    await tx.driverProfile.deleteMany({ where: { organizationId: orgAId } });
  });
  await admin.user.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
  await admin.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('tracking route -- role gate', () => {
  it('DRIVER (no tracking.read) is forbidden (403)', async () => {
    const headers = await loginAs(driverAId);
    const req = new NextRequest('http://localhost/api/v1/tracking', { headers });
    const res = await getTracking(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });
});

describe('tracking route -- cross-tenant isolation', () => {
  it(
    "org B's snapshot never reflects org A's fleet/trip data",
    async () => {
      const headers = await loginAs(operatorBId);
      const req = new NextRequest('http://localhost/api/v1/tracking', { headers });
      const res = await getTracking(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(200);
      const { snapshot } = await res.json();
      expect(snapshot.fleet).toHaveLength(0);
      expect(snapshot.activeTrips).toHaveLength(0);
    },
    60_000,
  );

  it(
    "org A's operator sees org A's own fleet/trip data",
    async () => {
      const headers = await loginAs(operatorAId);
      const req = new NextRequest('http://localhost/api/v1/tracking', { headers });
      const res = await getTracking(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(200);
      const { snapshot } = await res.json();
      expect(snapshot.fleet).toHaveLength(1);
      expect(snapshot.activeTrips).toHaveLength(1);
    },
    60_000,
  );
});

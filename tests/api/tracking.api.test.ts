import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { formatPackageReference } from '@modules/catalog';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { GET as getTracking } from '../../src/app/api/v1/tracking/route';

/**
 * Tracking (DR-041) -- drives the real route end to end against a small,
 * deterministic fixture: one active departure (started yesterday, ends
 * tomorrow) with an assigned vehicle/driver/guide and a located Starlink
 * kit, plus one NOT-YET-STARTED departure+assignment to confirm it's
 * excluded from activeTrips (a future trip must not show as "active" just
 * because an operations-utilization definition would count it).
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;

let orgId: string;
let operatorId: string;
let driverUserId: string;
let driverProfileId: string;
let guideUserId: string;
let vehicleId: string;
let futureVehicleId: string;

const now = new Date();

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `TRACKING-API-TEST-${suffix}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [operator, driverUser, guideUser] = await Promise.all([
    admin.user.create({ data: { email: `op-tracking-${suffix}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `driver-tracking-${suffix}@example.test`, role: 'DRIVER', organizationId: orgId } }),
    admin.user.create({ data: { email: `guide-tracking-${suffix}@example.test`, role: 'TOUR_GUIDE', organizationId: orgId } }),
  ]);
  operatorId = operator.id;
  driverUserId = driverUser.id;
  guideUserId = guideUser.id;

  await withOrg(orgId, async (tx) => {
    const driverProfile = await tx.driverProfile.create({
      data: { organizationId: orgId, userId: driverUserId, licenseNumber: `LIC-${suffix}` },
    });
    driverProfileId = driverProfile.id;
    const vehicle = await tx.vehicle.create({
      data: { organizationId: orgId, plateNumber: `TRK-${suffix}`, make: 'Toyota', model: 'Hilux', vehicleType: '4x4', seatCapacity: 4 },
    });
    vehicleId = vehicle.id;
    const futureVehicle = await tx.vehicle.create({
      data: { organizationId: orgId, plateNumber: `TRKF-${suffix}`, make: 'Toyota', model: 'Land Cruiser', vehicleType: '4x4', seatCapacity: 7 },
    });
    futureVehicleId = futureVehicle.id;
    await tx.starlinkKit.create({
      data: {
        organizationId: orgId,
        kitId: `KIT-${suffix}`,
        vehicleId,
        lastLatitude: -22.5597,
        lastLongitude: 17.0832,
        lastLocationAt: now,
      },
    });
  });

  await withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: formatPackageReference(Date.now()),
        title: `TEST-TRACKING-${suffix}`,
        description: 'Fixture for tracking tests.',
        country: 'NA',
        priceMinor: 100000,
        currency: 'USD',
        status: 'PUBLISHED',
      },
    });

    const activeDeparture = await tx.departure.create({
      data: {
        organizationId: orgId,
        tourPackageId: pkg.id,
        startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        endDate: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        capacity: 10,
      },
    });
    await tx.assignment.create({
      data: { organizationId: orgId, departureId: activeDeparture.id, vehicleId, driverProfileId, guideUserId },
    });

    // A future departure -- must NOT appear in activeTrips.
    const futureDeparture = await tx.departure.create({
      data: {
        organizationId: orgId,
        tourPackageId: pkg.id,
        startDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        endDate: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000),
        capacity: 10,
      },
    });
    await tx.assignment.create({
      data: { organizationId: orgId, departureId: futureDeparture.id, vehicleId: futureVehicleId, driverProfileId },
    });
  });
});

afterAll(async () => {
  // Guard: if beforeAll failed before orgId was assigned, Prisma silently
  // drops the undefined where-clause value, turning cleanup into an
  // unscoped deleteMany that wipes the whole table -- this has hit real
  // production data twice. Skip cleanup entirely rather than risk it.
  if (!orgId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await withOrg(orgId, async (tx) => {
    await tx.assignment.deleteMany({ where: { organizationId: orgId } });
    await tx.departure.deleteMany({ where: { organizationId: orgId } });
    await tx.tourPackage.deleteMany({ where: { organizationId: orgId } });
    await tx.starlinkKit.deleteMany({ where: { organizationId: orgId } });
    await tx.vehicle.deleteMany({ where: { organizationId: orgId } });
    await tx.driverProfile.deleteMany({ where: { organizationId: orgId } });
  });
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('GET /api/v1/tracking', () => {
  it(
    'returns the fleet snapshot matching the fixture',
    async () => {
      const headers = await loginAs(operatorId);
      const req = new NextRequest('http://localhost/api/v1/tracking', { headers });
      const res = await getTracking(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(200);
      const { snapshot } = await res.json();

      expect(snapshot.fleet).toHaveLength(1);
      expect(snapshot.fleet[0].kitId).toBe(`KIT-${suffix}`);
      expect(snapshot.fleet[0].plateNumber).toBe(`TRK-${suffix}`);
      expect(snapshot.fleet[0].latitude).toBeCloseTo(-22.5597, 3);
      expect(snapshot.fleet[0].freshness).toBe('FRESH');

      // Only the active departure appears -- the future one is excluded.
      expect(snapshot.activeTrips).toHaveLength(1);
      const trip = snapshot.activeTrips[0];
      expect(trip.packageTitle).toBe(`TEST-TRACKING-${suffix}`);
      expect(trip.country).toBe('NA');
      expect(trip.vehiclePlate).toBe(`TRK-${suffix}`);
      expect(trip.driverName).toBeTruthy();
      expect(trip.guideName).toBeTruthy();
      expect(trip.progress.status).toBe('IN_PROGRESS');
      expect(trip.progress.dayNumber).toBe(2);
      expect(trip.progress.totalDays).toBe(3);
    },
    60_000,
  );
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { generateBookingReference } from '@modules/booking';
import { testPackageReference } from '../helpers/package-reference';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { GET as getTracking } from '../../src/app/api/v1/tracking/route';

/**
 * Tracking (DR-041) -- drives the real route end to end against a small,
 * deterministic fixture: one active departure (started yesterday, ends
 * tomorrow) with an assigned vehicle/driver/guide, a located Starlink kit,
 * and a live CONFIRMED booking, plus one NOT-YET-STARTED departure+
 * assignment+booking to confirm it's excluded from activeTrips (a future
 * trip must not show as "active" just because an operations-utilization
 * definition would count it).
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;

let orgId: string;
let operatorId: string;
let touristUserId: string;
let driverUserId: string;
let driverProfileId: string;
let guideUserId: string;
let vehicleId: string;
let futureVehicleId: string;
let starlinkKitId: string;
let activeDepartureId: string;
let activeBookingId: string;

const now = new Date();

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `TRACKING-API-TEST-${suffix}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [operator, tourist, driverUser, guideUser] = await Promise.all([
    admin.user.create({ data: { email: `op-tracking-${suffix}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `tourist-tracking-${suffix}@example.test`, role: 'TOURIST', organizationId: orgId } }),
    admin.user.create({ data: { email: `driver-tracking-${suffix}@example.test`, role: 'DRIVER', organizationId: orgId } }),
    admin.user.create({ data: { email: `guide-tracking-${suffix}@example.test`, role: 'TOUR_GUIDE', organizationId: orgId } }),
  ]);
  operatorId = operator.id;
  touristUserId = tourist.id;
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
    const kit = await tx.starlinkKit.create({
      data: {
        organizationId: orgId,
        kitId: `KIT-${suffix}`,
        vehicleId,
        lastLatitude: -22.5597,
        lastLongitude: 17.0832,
        lastLocationAt: now,
      },
    });
    starlinkKitId = kit.id;
  });

  await withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: testPackageReference(),
        title: `TEST-TRACKING-${suffix}`,
        description: 'Fixture for tracking tests.',
        country: 'NA',
        priceMinor: 100000,
        currency: 'USD',
        status: 'PUBLISHED_AVAILABLE',
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
    activeDepartureId = activeDeparture.id;
    await tx.assignment.create({
      data: { organizationId: orgId, departureId: activeDeparture.id, vehicleId, driverProfileId, guideUserId },
    });
    // A live booking behind the trip -- without one, hasActiveBookingForDeparture
    // excludes the departure from activeTrips regardless of its dates (see the
    // "disappears once its booking is soft-deleted" test below).
    const activeBooking = await tx.booking.create({
      data: {
        organizationId: orgId,
        departureId: activeDeparture.id,
        touristUserId,
        bookingReference: generateBookingReference(),
        seats: 2,
        priceMinor: 100000,
        currency: 'USD',
        status: 'CONFIRMED',
      },
    });
    activeBookingId = activeBooking.id;

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
    await tx.booking.create({
      data: {
        organizationId: orgId,
        departureId: futureDeparture.id,
        touristUserId,
        bookingReference: generateBookingReference(),
        seats: 2,
        priceMinor: 100000,
        currency: 'USD',
        status: 'CONFIRMED',
      },
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
    await tx.booking.deleteMany({ where: { organizationId: orgId } });
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
      // Regression: the "Update" link on /staff/tracking must resolve via
      // the kit's real row id (what findStarlinkKitById looks up), not the
      // human-readable kitId label -- a past bug conflated the two.
      expect(snapshot.fleet[0].starlinkKitId).toBe(starlinkKitId);
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

  it(
    'drops a trip from activeTrips as soon as its booking is deleted, even though its Assignment/Departure survive',
    async () => {
      // Reproduces the "ghost trip" gap: deleteBooking only soft-deletes the
      // Booking row -- it never touches the Departure or Assignment (neither
      // has a bookingId to cascade from), so without a live-booking check
      // this trip would otherwise keep reading IN_PROGRESS by date alone
      // until the departure's own endDate finally passes. The page itself
      // is never cached, so the very next read must reflect the deletion.
      await withOrg(orgId, (tx) => tx.booking.update({ where: { id: activeBookingId }, data: { deletedAt: new Date() } }));

      const headers = await loginAs(operatorId);
      const req = new NextRequest('http://localhost/api/v1/tracking', { headers });
      const res = await getTracking(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(200);
      const { snapshot } = await res.json();

      expect(snapshot.activeTrips.find((t: { departureId: string }) => t.departureId === activeDepartureId)).toBeUndefined();
    },
    60_000,
  );
});

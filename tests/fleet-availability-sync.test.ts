import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { testPackageReference } from './helpers/package-reference';
import { generateBookingReference } from '@modules/booking';
import { prisma, withOrg } from '../src/lib/db';
import { syncFleetAvailabilityForDeparture } from '../src/lib/fleet-availability';

/**
 * DR-082: end-to-end test of the cross-module sync helper -- given a real
 * Assignment (vehicle/driver/guide) on a departure, confirms availability
 * tracks the departure's booking status through CONFIRMED -> COMPLETED,
 * without going through the full ctx/RBAC-gated service methods (this
 * fixture writes Booking/Assignment rows directly, same convention as
 * tests/api/hotel-restaurant-rating.api.test.ts's fixture).
 */
const admin = new PrismaClient();

let orgId: string;
let departureId: string;
let bookingId: string;
let vehicleId: string;
let driverProfileId: string;
let guideUserId: string;

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `FLEET-SYNC-TEST-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [touristUser, driverUser, guideUser] = await Promise.all([
    admin.user.create({ data: { email: `tourist-sync-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
    admin.user.create({ data: { email: `driver-sync-${Date.now()}@example.test`, role: 'DRIVER', organizationId: orgId } }),
    admin.user.create({ data: { email: `guide-sync-${Date.now()}@example.test`, role: 'TOUR_GUIDE', organizationId: orgId } }),
  ]);
  guideUserId = guideUser.id;

  await withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: testPackageReference(),
        title: 'Fleet Sync Fixture Safari',
        description: 'Fixture.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
        status: 'PUBLISHED_AVAILABLE',
      },
    });
    const departure = await tx.departure.create({
      data: { organizationId: orgId, tourPackageId: pkg.id, startDate: new Date('2026-09-01'), capacity: 5, status: 'SCHEDULED' },
    });
    departureId = departure.id;
    const booking = await tx.booking.create({
      data: {
        organizationId: orgId,
        departureId,
        touristUserId: touristUser.id,
        bookingReference: generateBookingReference(),
        seats: 2,
        priceMinor: 10000,
        currency: 'USD',
        status: 'DEPOSIT_PAID',
      },
    });
    bookingId = booking.id;

    const vehicle = await tx.vehicle.create({
      data: { organizationId: orgId, plateNumber: `SYNC-${Date.now()}`, make: 'Toyota', model: 'Hilux', vehicleType: '4x4', seatCapacity: 5, status: 'ACTIVE' },
    });
    vehicleId = vehicle.id;
    const driver = await tx.driverProfile.create({
      data: { organizationId: orgId, userId: driverUser.id, licenseNumber: `DL-SYNC-${Date.now()}`, status: 'ACTIVE' },
    });
    driverProfileId = driver.id;
    await tx.guideProfile.create({ data: { organizationId: orgId, userId: guideUserId, status: 'ACTIVE' } });
    await tx.assignment.create({
      data: { organizationId: orgId, departureId, vehicleId, driverProfileId, guideUserId },
    });
  });
});

afterAll(async () => {
  if (!orgId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await withOrg(orgId, (tx) => tx.assignment.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.driverProfile.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.guideProfile.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.vehicle.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.booking.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.departure.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
}, 30_000);

async function readAvailability() {
  return withOrg(orgId, async (tx) => {
    const [vehicle, driver, guide] = await Promise.all([
      tx.vehicle.findUniqueOrThrow({ where: { id: vehicleId } }),
      tx.driverProfile.findUniqueOrThrow({ where: { id: driverProfileId } }),
      tx.guideProfile.findUniqueOrThrow({ where: { userId: guideUserId } }),
    ]);
    return { vehicle: vehicle.availability, driver: driver.availability, guide: guide.availability };
  });
}

describe('syncFleetAvailabilityForDeparture', () => {
  it('leaves everything AVAILABLE while the booking is only DEPOSIT_PAID (not yet a real commitment)', async () => {
    await syncFleetAvailabilityForDeparture(orgId, departureId);
    expect(await readAvailability()).toEqual({ vehicle: 'AVAILABLE', driver: 'AVAILABLE', guide: 'AVAILABLE' });
  });

  it('marks everything BOOKED once the booking is CONFIRMED', async () => {
    await withOrg(orgId, (tx) => tx.booking.update({ where: { id: bookingId }, data: { status: 'CONFIRMED' } }));
    await syncFleetAvailabilityForDeparture(orgId, departureId);
    expect(await readAvailability()).toEqual({ vehicle: 'BOOKED', driver: 'BOOKED', guide: 'BOOKED' });
  });

  it('frees everything back to AVAILABLE once the booking is COMPLETED', async () => {
    await withOrg(orgId, (tx) => tx.booking.update({ where: { id: bookingId }, data: { status: 'COMPLETED' } }));
    await syncFleetAvailabilityForDeparture(orgId, departureId);
    expect(await readAvailability()).toEqual({ vehicle: 'AVAILABLE', driver: 'AVAILABLE', guide: 'AVAILABLE' });
  });

  it('frees everything back to AVAILABLE once a CONFIRMED booking is soft-deleted (DR-149)', async () => {
    // softDelete (bookingService.deleteBooking, DR-058) never touches
    // `status` -- only setting deletedAt reproduces that shape here, same
    // as tests/booking-delete.test.ts's own raw-fixture convention.
    await withOrg(orgId, (tx) => tx.booking.update({ where: { id: bookingId }, data: { status: 'CONFIRMED', deletedAt: null } }));
    await syncFleetAvailabilityForDeparture(orgId, departureId);
    expect(await readAvailability()).toEqual({ vehicle: 'BOOKED', driver: 'BOOKED', guide: 'BOOKED' });

    await withOrg(orgId, (tx) => tx.booking.update({ where: { id: bookingId }, data: { deletedAt: new Date() } }));
    await syncFleetAvailabilityForDeparture(orgId, departureId);
    expect(await readAvailability()).toEqual({ vehicle: 'AVAILABLE', driver: 'AVAILABLE', guide: 'AVAILABLE' });
  });

  it('is a silent no-op for a departure with no assignments at all', async () => {
    const bareDeparture = await withOrg(orgId, async (tx) => {
      const pkg = await tx.tourPackage.findFirstOrThrow({ where: { organizationId: orgId } });
      return tx.departure.create({
        data: { organizationId: orgId, tourPackageId: pkg.id, startDate: new Date('2026-10-01'), capacity: 3, status: 'SCHEDULED' },
      });
    });
    await expect(syncFleetAvailabilityForDeparture(orgId, bareDeparture.id)).resolves.toBeUndefined();
  });
});

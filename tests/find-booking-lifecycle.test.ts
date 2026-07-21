import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { formatPackageReference } from '@modules/catalog';
import { generateBookingReference } from '@modules/booking';
import { itineraryService } from '@modules/itinerary';
import { fleetService } from '@modules/fleet';
import { visaService } from '@modules/visa';
import { ratingsService } from '@modules/ratings';
import { prisma, withOrg } from '../src/lib/db';

/**
 * Explicit user direction: the guest `/find-booking` lookup should also
 * surface booking-lifecycle status -- itinerary approval, driver/vehicle/
 * guide assignment, Starlink kit tracking, visa status (only when
 * requiresPassportUpload), and whether a Rating Code is available. All of
 * this is composed in src/app/(guest)/find-booking/result/page.tsx via the
 * no-ctx "*ForBookingLookup" service methods this file exercises directly
 * (the page itself needs a real browser to click through, same limitation
 * as every other guest-wizard UI in this codebase).
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;

let orgId: string;
let bookingId: string;
let travelerId: string;
let vehicleId: string;

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `FIND-BOOKING-LIFECYCLE-TEST-${suffix}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [tourist, driverUser, guideUser, superadmin] = await Promise.all([
    admin.user.create({ data: { email: `t-fbl-${suffix}@example.test`, role: 'TOURIST', organizationId: orgId } }),
    admin.user.create({ data: { email: `d-fbl-${suffix}@example.test`, role: 'DRIVER', organizationId: orgId, name: 'Fixture Driver' } }),
    admin.user.create({ data: { email: `g-fbl-${suffix}@example.test`, role: 'TOUR_GUIDE', organizationId: orgId, name: 'Fixture Guide' } }),
    admin.user.create({ data: { email: `sa-fbl-${suffix}@example.test`, role: 'SUPERADMIN', organizationId: orgId } }),
  ]);

  await withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: formatPackageReference(Date.now()),
        title: 'Lifecycle Fixture Safari',
        description: 'Fixture.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
        durationDays: 3,
        status: 'PUBLISHED',
      },
    });
    const departure = await tx.departure.create({
      data: { organizationId: orgId, tourPackageId: pkg.id, startDate: new Date('2026-10-01T00:00:00Z'), capacity: 2, status: 'SCHEDULED' },
    });
    const booking = await tx.booking.create({
      data: {
        organizationId: orgId,
        departureId: departure.id,
        touristUserId: tourist.id,
        bookingReference: generateBookingReference(),
        seats: 1,
        priceMinor: 10000,
        currency: 'USD',
        requiresPassportUpload: true,
      },
    });
    bookingId = booking.id;

    const traveler = await tx.traveler.create({
      data: {
        organizationId: orgId,
        bookingId: booking.id,
        firstName: 'Fixture',
        lastName: 'Traveler',
        age: 30,
        sex: 'X',
        nationality: 'NA',
        idOrPassportNumber: 'FBL-TRAVELER-1',
        isTourLead: true,
      },
    });
    travelerId = traveler.id;

    await tx.itinerary.create({
      data: { organizationId: orgId, bookingId: booking.id, status: 'APPROVED', approvedAt: new Date(), approvedByUserId: superadmin.id },
    });

    const vehicle = await tx.vehicle.create({
      data: { organizationId: orgId, plateNumber: `FBL-${suffix}`, make: 'Toyota', model: 'Hilux', vehicleType: '4x4', seatCapacity: 4 },
    });
    vehicleId = vehicle.id;

    const driverProfile = await tx.driverProfile.create({
      data: { organizationId: orgId, userId: driverUser.id, licenseNumber: `LIC-${suffix}` },
    });

    await tx.starlinkKit.create({
      data: { organizationId: orgId, kitId: `KIT-${suffix}`, vehicleId: vehicle.id },
    });

    await tx.assignment.create({
      data: {
        organizationId: orgId,
        departureId: departure.id,
        vehicleId: vehicle.id,
        driverProfileId: driverProfile.id,
        guideUserId: guideUser.id,
      },
    });

    await tx.visaApplication.create({
      data: {
        organizationId: orgId,
        travelerId: traveler.id,
        country: 'NA',
        travelerFirstName: traveler.firstName,
        travelerLastName: traveler.lastName,
        travelerNationality: traveler.nationality,
        travelerIdOrPassportNumber: traveler.idOrPassportNumber,
        status: 'SUBMITTED',
      },
    });

    await tx.ratingCode.create({
      data: {
        organizationId: orgId,
        bookingId: booking.id,
        code: `RATE${suffix}`.slice(0, 10),
        issuedByUserId: superadmin.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  });
});

afterAll(async () => {
  if (!orgId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await withOrg(orgId, (tx) => tx.ratingCode.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.visaApplication.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.assignment.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.starlinkKit.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.driverProfile.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.vehicle.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.itinerary.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.traveler.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.booking.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.departure.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
}, 30_000);

describe('find-booking lifecycle no-ctx lookups', () => {
  it('itineraryService.getStatusForBookingLookup resolves the real status, null when none exists', async () => {
    expect(await itineraryService.getStatusForBookingLookup(orgId, bookingId)).toBe('APPROVED');
    expect(await itineraryService.getStatusForBookingLookup(orgId, '00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('fleetService.listVehiclesForBookingLookup resolves real vehicle details', async () => {
    const vehicles = await fleetService.listVehiclesForBookingLookup(orgId, [vehicleId]);
    expect(vehicles).toHaveLength(1);
    expect(vehicles[0]).toMatchObject({ make: 'Toyota', model: 'Hilux' });
    expect(await fleetService.listVehiclesForBookingLookup(orgId, [])).toEqual([]);
  });

  it('fleetService.listStarlinkKitsByVehicleIdsForBookingLookup resolves the assigned kit', async () => {
    const kits = await fleetService.listStarlinkKitsByVehicleIdsForBookingLookup(orgId, [vehicleId]);
    expect(kits.has(vehicleId)).toBe(true);
    expect(await fleetService.listStarlinkKitsByVehicleIdsForBookingLookup(orgId, [])).toEqual(new Map());
  });

  it('visaService.getStatusForBookingLookup resolves the real status, null when none exists', async () => {
    expect(await visaService.getStatusForBookingLookup(orgId, travelerId)).toBe('SUBMITTED');
    expect(await visaService.getStatusForBookingLookup(orgId, '00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('ratingsService.getRatingCodeStatusForBookingLookup redacts the raw code, null when none exists', async () => {
    const status = await ratingsService.getRatingCodeStatusForBookingLookup(orgId, bookingId);
    expect(status).not.toBeNull();
    expect(status!.available).toBe(true);
    expect('code' in status!).toBe(false);

    expect(await ratingsService.getRatingCodeStatusForBookingLookup(orgId, '00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});

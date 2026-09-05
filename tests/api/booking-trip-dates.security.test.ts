import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testPackageReference } from '../helpers/package-reference';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { generateBookingReference } from '../../src/modules/booking';

const { PATCH: updateTripDates } = await import('../../src/app/api/v1/bookings/[bookingId]/trip-dates/route');

/**
 * DR-219: changing a booking's trip date was previously not possible at
 * all -- now that it is, isDepartureDateChanger (booking/domain.ts) gates it
 * to SUPERADMIN/TOUR_OPERATOR only. `booking.confirm` alone isn't the real
 * gate here: PLATFORM_ADMIN holds that permission too (for
 * refund/quotation/etc.) but must still be rejected by this specific action,
 * same "route passes the broader permission, the service narrows it"
 * layering as bookingService.confirm's own isBookingConfirmer check.
 */
const admin = new PrismaClient();

let orgId: string;
let bookingId: string;
let platformAdminId: string;
let tourOperatorId: string;
let superadminId: string;

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `SEC-TRIPDATES-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [platformAdmin, tourOperator, superadmin] = await Promise.all([
    admin.user.create({ data: { email: `sec-pa-${Date.now()}@example.test`, role: 'PLATFORM_ADMIN', organizationId: orgId } }),
    admin.user.create({ data: { email: `sec-to-${Date.now()}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `sec-sa-${Date.now()}@example.test`, role: 'SUPERADMIN', organizationId: orgId } }),
  ]);
  platformAdminId = platformAdmin.id;
  tourOperatorId = tourOperator.id;
  superadminId = superadmin.id;

  await withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: testPackageReference(),
        title: 'Trip Dates Fixture Safari',
        description: 'Fixture for the DR-219 trip-date-change security test.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
        durationDays: 5,
        status: 'PUBLISHED_AVAILABLE',
      },
    });
    // Relative to "now", not hardcoded -- a fixed past-tense literal date
    // eventually becomes real history as the calendar advances, at which
    // point bookingRepository.sweepLifecycle's lazy CONFIRMED -> IN_PROGRESS
    // -> COMPLETED transitions silently lock this booking before the test
    // ever runs, turning every "can change trip date (200)" case here into
    // a 409 with no code change involved at all (a real incident this
    // exact test hit once real time caught up to its original 2026-09
    // literals). Comfortably in the future, both legs.
    const departure = await tx.departure.create({
      data: {
        organizationId: orgId,
        tourPackageId: pkg.id,
        startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000),
        capacity: 5,
        status: 'SCHEDULED',
      },
    });
    const booking = await tx.booking.create({
      data: {
        organizationId: orgId,
        departureId: departure.id,
        touristUserId: platformAdminId,
        bookingReference: generateBookingReference(),
        seats: 1,
        priceMinor: 10000,
        currency: 'USD',
        status: 'CONFIRMED',
      },
    });
    bookingId = booking.id;
  });
});

afterAll(async () => {
  if (!orgId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await withOrg(orgId, (tx) => tx.booking.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.departure.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

async function patchTripDate(userId: string, startDate: string) {
  const headers = await loginAs(userId);
  headers.set('content-type', 'application/json');
  const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/trip-dates`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ startDate }),
  });
  return updateTripDates(req, { params: Promise.resolve({ bookingId }) });
}

describe('trip date change (DR-219)', () => {
  it('PLATFORM_ADMIN is rejected even though booking.confirm is granted to that role (403)', async () => {
    const res = await patchTripDate(platformAdminId, '2026-10-01');
    expect(res.status).toBe(403);
  });

  it('TOUR_OPERATOR can change the trip date on a CONFIRMED booking (200)', async () => {
    const res = await patchTripDate(tourOperatorId, '2026-10-10');
    expect(res.status).toBe(200);
  });

  it('SUPERADMIN can also change the trip date (200)', async () => {
    const res = await patchTripDate(superadminId, '2026-10-20');
    expect(res.status).toBe(200);
  });
});

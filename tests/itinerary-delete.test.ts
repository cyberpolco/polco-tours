import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { formatPackageReference } from '@modules/catalog';
import { generateBookingReference } from '@modules/booking';
import { itineraryService } from '@modules/itinerary';
import { prisma, withOrg } from '../src/lib/db';
import type { AuthContext } from '../src/modules/auth/domain';

/**
 * DR-059 follow-up: deleting a Booking now also removes its Itinerary (see
 * itineraryService.deleteForBooking + the staff deleteBookingAction that
 * orchestrates both calls, since the itinerary module already depends on
 * booking and can't be depended on back). Own throwaway org since this
 * creates/deletes fixture data directly.
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;

let orgId: string;
let operatorId: string;
let touristId: string;

function ctxFor(userId: string): AuthContext {
  return {
    userId,
    roles: ['TOUR_OPERATOR'],
    permissions: new Set(['itinerary.write']),
    organizationId: orgId,
    sessionId: 'test-session',
    mustChangePassword: false,
  };
}

async function createBookingWithItinerary(): Promise<{ bookingId: string; itineraryId: string }> {
  return withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: formatPackageReference(Date.now()),
        title: `Itinerary Delete Fixture ${suffix}`,
        description: 'Fixture.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
        status: 'PUBLISHED',
      },
    });
    const departure = await tx.departure.create({
      data: { organizationId: orgId, tourPackageId: pkg.id, startDate: new Date('2026-09-01'), capacity: 5, status: 'SCHEDULED' },
    });
    const booking = await tx.booking.create({
      data: {
        organizationId: orgId,
        departureId: departure.id,
        touristUserId: touristId,
        bookingReference: generateBookingReference(),
        seats: 2,
        priceMinor: 10000,
        currency: 'USD',
      },
    });
    const itinerary = await tx.itinerary.create({ data: { organizationId: orgId, bookingId: booking.id } });
    await tx.itineraryDay.create({
      data: { organizationId: orgId, itineraryId: itinerary.id, dayNumber: 1, date: new Date('2026-09-01') },
    });
    return { bookingId: booking.id, itineraryId: itinerary.id };
  });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `ITIN-DELETE-TEST-${suffix}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [operator, tourist] = await Promise.all([
    admin.user.create({ data: { email: `itin-delete-op-${suffix}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `itin-delete-tourist-${suffix}@example.test`, role: 'TOURIST', organizationId: orgId } }),
  ]);
  operatorId = operator.id;
  touristId = tourist.id;
});

afterAll(async () => {
  if (!orgId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await withOrg(orgId, (tx) => tx.itineraryDay.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.itinerary.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.booking.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.departure.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
}, 30_000);

describe('itineraryService.deleteForBooking (DR-059 follow-up)', () => {
  it('removes the booking\'s itinerary and cascades to its ItineraryDay rows', async () => {
    const { bookingId, itineraryId } = await createBookingWithItinerary();

    await itineraryService.deleteForBooking(ctxFor(operatorId), bookingId);

    const itinerary = await withOrg(orgId, (tx) => tx.itinerary.findUnique({ where: { id: itineraryId } }));
    expect(itinerary).toBeNull();
    const days = await withOrg(orgId, (tx) => tx.itineraryDay.findMany({ where: { itineraryId } }));
    expect(days).toHaveLength(0);
  });

  it('is a no-op, not an error, when the booking has no itinerary at all', async () => {
    const booking = await withOrg(orgId, (tx) =>
      tx.booking.create({
        data: {
          organizationId: orgId,
          origin: 'TAILOR_MADE',
          touristUserId: touristId,
          bookingReference: generateBookingReference(),
          seats: 1,
          status: 'AWAITING_QUOTATION',
        },
      }),
    );
    await expect(itineraryService.deleteForBooking(ctxFor(operatorId), booking.id)).resolves.toBeUndefined();
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { catalogService } from '@modules/catalog';
import { testPackageReference } from './helpers/package-reference';
import { generateBookingReference } from '@modules/booking';
import { itineraryService } from '@modules/itinerary';
import { prisma, withOrg } from '../src/lib/db';
import type { AuthContext } from '../src/modules/auth/domain';

/**
 * Explicit user direction: a package's reusable day-by-day itinerary
 * template gets copied onto a fresh Itinerary's real, dated ItineraryDay
 * rows the moment one is created for a booking against that package, so
 * staff review an already-populated plan instead of starting from scratch.
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
    permissions: new Set(['itinerary.write', 'itinerary.read', 'catalog.write', 'catalog.read', 'booking.read']),
    organizationId: orgId,
    sessionId: 'test-session',
    mustChangePassword: false,
  };
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `PKG-ITIN-TEMPLATE-TEST-${suffix}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [operator, tourist] = await Promise.all([
    admin.user.create({ data: { email: `op-pkgitin-${suffix}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `t-pkgitin-${suffix}@example.test`, role: 'TOURIST', organizationId: orgId } }),
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
  await withOrg(orgId, (tx) => tx.packageItineraryDay.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.activity.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.site.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.booking.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.departure.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
}, 30_000);

describe('Package itinerary template', () => {
  it('addTemplateDay/listTemplateDays/updateTemplateDay/removeTemplateDay work as expected', async () => {
    const pkg = await withOrg(orgId, (tx) =>
      tx.tourPackage.create({
        data: {
          organizationId: orgId,
          packageReference: testPackageReference(),
          title: 'Template CRUD Fixture',
          description: 'Fixture.',
          country: 'NA',
          priceMinor: 10000,
          currency: 'USD',
          durationDays: 3,
          status: 'PUBLISHED_AVAILABLE',
        },
      }),
    );

    const day1 = await catalogService.addTemplateDay(ctxFor(operatorId), pkg.id, { dayNumber: 1, activities: 'Arrival' });
    expect(day1.dayNumber).toBe(1);

    const updated = await catalogService.updateTemplateDay(ctxFor(operatorId), day1.id, { activities: 'Arrival + welcome dinner' });
    expect(updated.activities).toBe('Arrival + welcome dinner');

    const days = await catalogService.listTemplateDays(ctxFor(operatorId), pkg.id);
    expect(days.map((d) => d.id)).toContain(day1.id);

    await catalogService.removeTemplateDay(ctxFor(operatorId), day1.id);
    const afterRemove = await catalogService.listTemplateDays(ctxFor(operatorId), pkg.id);
    expect(afterRemove.map((d) => d.id)).not.toContain(day1.id);
  });

  it('createItinerary auto-copies the package template onto the new Itinerary with computed real dates', async () => {
    const startDate = new Date('2026-10-01T00:00:00Z');
    // Split into two transactions -- independent reference data (hotel/
    // restaurant/site/activity) first, then the package/departure/booking
    // chain -- so neither one's round-trip count risks tripping Prisma's
    // 5s interactive-transaction timeout under this sandbox's occasional
    // slow-Neon-pooler latency (see the CLAUDE.md gotcha on this).
    const { hotelId, restaurantId, activityId } = await withOrg(orgId, async (tx) => {
      const hotel = await tx.hotel.create({ data: { organizationId: orgId, name: 'Auto-Copy Fixture Hotel', country: 'NA' } });
      const restaurant = await tx.restaurant.create({ data: { organizationId: orgId, name: 'Auto-Copy Fixture Restaurant', country: 'NA' } });
      const site = await tx.site.create({ data: { organizationId: orgId, name: 'Auto-Copy Fixture Site', country: 'NA', province: 'Kunene' } });
      const activity = await tx.activity.create({ data: { organizationId: orgId, siteId: site.id, name: 'Game drive' } });
      return { hotelId: hotel.id, restaurantId: restaurant.id, activityId: activity.id };
    });

    const { bookingId } = await withOrg(orgId, async (tx) => {
      const pkg = await tx.tourPackage.create({
        data: {
          organizationId: orgId,
          packageReference: testPackageReference(),
          title: 'Auto-Copy Fixture Safari',
          description: 'Fixture.',
          country: 'NA',
          priceMinor: 10000,
          currency: 'USD',
          durationDays: 3,
          status: 'PUBLISHED_AVAILABLE',
        },
      });
      // DR-119: hotelId/restaurantId on the template day. DR-120: activityIds.
      await tx.packageItineraryDay.create({
        data: {
          organizationId: orgId,
          tourPackageId: pkg.id,
          dayNumber: 1,
          activities: 'Arrival',
          hotelId,
          restaurantId,
          activityIds: [activityId],
        },
      });
      await tx.packageItineraryDay.create({
        data: { organizationId: orgId, tourPackageId: pkg.id, dayNumber: 2, activities: 'Safari drive' },
      });
      const departure = await tx.departure.create({
        data: { organizationId: orgId, tourPackageId: pkg.id, startDate, capacity: 2, status: 'SCHEDULED' },
      });
      const booking = await tx.booking.create({
        data: {
          organizationId: orgId,
          departureId: departure.id,
          touristUserId: touristId,
          bookingReference: generateBookingReference(),
          seats: 1,
          priceMinor: 10000,
          currency: 'USD',
        },
      });
      return { bookingId: booking.id };
    });

    const itinerary = await itineraryService.createItinerary(ctxFor(operatorId), bookingId, {});
    const days = await itineraryService.listDays(ctxFor(operatorId), itinerary.id);

    expect(days).toHaveLength(2);
    const day1 = days.find((d) => d.dayNumber === 1);
    const day2 = days.find((d) => d.dayNumber === 2);
    expect(day1?.activities).toBe('Arrival');
    // DR-119: hotelId/restaurantId ARE copied onto the new ItineraryDay --
    // both already real ids on ItineraryDay itself (DR-083), unlike the
    // planned-sites concept (ItineraryDaySite), which catalog still can't
    // populate without inverting the module dependency direction.
    expect(day1?.hotelId).toBe(hotelId);
    expect(day1?.restaurantId).toBe(restaurantId);
    // DR-120: activityIds ARE copied too -- this is the actual regression
    // test for the gap this DR closes (previously silently dropped, since
    // ItineraryDay had no activityIds column at all to copy it onto).
    expect(day1?.activityIds).toEqual([activityId]);
    expect(day1?.date.toISOString().slice(0, 10)).toBe('2026-10-01');
    expect(day2?.activities).toBe('Safari drive');
    expect(day2?.hotelId).toBeNull();
    expect(day2?.date.toISOString().slice(0, 10)).toBe('2026-10-02');
  });

  it('createItinerary is a no-op for template-copying when the booking has no departure (TAILOR_MADE, not yet converted)', async () => {
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

    const itinerary = await itineraryService.createItinerary(ctxFor(operatorId), booking.id, {});
    const days = await itineraryService.listDays(ctxFor(operatorId), itinerary.id);
    expect(days).toHaveLength(0);
  });
});

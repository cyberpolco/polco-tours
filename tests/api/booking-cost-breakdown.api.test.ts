import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { generateBookingReference } from '@modules/booking';
import { testPackageReference } from '../helpers/package-reference';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { GET as getCostBreakdown, PUT as saveCostBreakdown } from '../../src/app/api/v1/bookings/[bookingId]/cost-breakdown/route';

/**
 * DR-092 -- a TAILOR_MADE booking's cost breakdown: same cost-plus engine as
 * the package flow (DR-039), but currency is derived (not caller-supplied),
 * referenceGroupSize is the booking's own seat count, already-selected
 * add-ons fold into the suggested total, and NOTHING gets written to
 * Booking.priceMinor/currency -- this only computes a suggestion.
 *
 * DR-131: accommodation/restaurant/activities are derived from the booking's
 * linked customized package's Day Template (Booking.customizedPackageId),
 * not staff-picked -- 0 if no customized package is linked yet.
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;
const TEST_COUNTRY = 'ZV'; // fictitious, avoids colliding with real seeded rows

let orgId: string;
let operatorId: string;
let touristId: string;
let bookingId: string; // seats=2, one USD add-on already selected, linked customized package has a 1-day Day Template
let noAddonsBookingId: string; // seats=1, no add-ons, no customized package, no rates ever referenced
let eurAddonBookingId: string; // seats=1, one EUR add-on, no customized package, no rates ever referenced
let predefinedBookingId: string; // origin PREDEFINED_PACKAGE
let noCountryBookingId: string; // TAILOR_MADE but customCountry unset
let unresolvedTemplateBookingId: string; // linked customized package's Day Template has a hotel with no effective HotelRate
let transportRateId: string;
let eurImmigrationRateId: string;

function jsonRequest(url: string, headers: Headers, method: string, body?: unknown): NextRequest {
  const h = new Headers(headers);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeAll(async () => {
  // Default 20s hook timeout isn't enough for this many sequential
  // transactions (each a real network round-trip to Neon) -- see the
  // matching 60_000 passed below.
  const org = await admin.organization.create({
    data: { name: `BOOKING-COST-BREAKDOWN-TEST-${suffix}`, countries: [TEST_COUNTRY], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [operator, tourist] = await Promise.all([
    admin.user.create({ data: { email: `op-booking-cost-${suffix}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `tourist-booking-cost-${suffix}@example.test`, role: 'TOURIST', organizationId: orgId } }),
  ]);
  operatorId = operator.id;
  touristId = tourist.id;

  // Rates are platform-wide (no org scoping), same as the package-flow fixture.
  await Promise.all([
    admin.staffRate.create({ data: { country: TEST_COUNTRY, role: 'DRIVER', dailyRateMinor: 10000, currency: 'USD' } }),
    admin.staffRate.create({ data: { country: TEST_COUNTRY, role: 'GUIDE', dailyRateMinor: 8000, currency: 'USD' } }),
  ]);
  const [transportRate, eurImmigrationRate] = await Promise.all([
    admin.transportRate.create({
      data: { country: TEST_COUNTRY, fuelEstimateMinor: 3000, tollFeesMinor: 500, parkingFeesMinor: 200, vehicleOperatingCostMinor: 1000, currency: 'USD' },
    }),
    // Deliberately a different currency than every other TEST_COUNTRY rate --
    // fixture for the "resolved rates disagree in currency" 409 case.
    admin.immigrationCostRate.create({
      data: { country: TEST_COUNTRY, visaFeeMinor: 1000, processingFeeMinor: 0, invitationLetterFeeMinor: 0, borderPermitFeeMinor: 0, currency: 'EUR' },
    }),
  ]);
  transportRateId = transportRate.id;
  eurImmigrationRateId = eurImmigrationRate.id;

  // Entities are created in their own transaction, awaited to commit, before
  // any admin.*Rate.create() references them by id below -- admin is a
  // separate PrismaClient/connection from `tx`, so referencing a row still
  // inside an open withOrg transaction would race the FK check against it.
  const { hotelId, restaurantId, activityId, unpricedHotelId } = await withOrg(orgId, async (tx) => {
    const hotel = await tx.hotel.create({ data: { organizationId: orgId, name: `Fixture Hotel ${suffix}`, country: TEST_COUNTRY } });
    const restaurant = await tx.restaurant.create({ data: { organizationId: orgId, name: `Fixture Restaurant ${suffix}`, country: TEST_COUNTRY } });
    const site = await tx.site.create({ data: { organizationId: orgId, name: `Fixture Site ${suffix}`, country: TEST_COUNTRY, province: 'Fixture' } });
    const activity = await tx.activity.create({ data: { organizationId: orgId, siteId: site.id, name: 'Fixture activity' } });
    const unpricedHotel = await tx.hotel.create({ data: { organizationId: orgId, name: `Unpriced Hotel ${suffix}`, country: TEST_COUNTRY } });
    return { hotelId: hotel.id, restaurantId: restaurant.id, activityId: activity.id, unpricedHotelId: unpricedHotel.id };
  });

  await Promise.all([
    admin.hotelRate.create({ data: { country: TEST_COUNTRY, hotelId, roomCategory: 'Standard', nightlyRateMinor: 5000, currency: 'USD' } }),
    admin.restaurantRate.create({ data: { country: TEST_COUNTRY, restaurantId, dailyRateMinor: 1000, currency: 'USD' } }),
    admin.activityFee.create({ data: { country: TEST_COUNTRY, activityId, name: 'Fixture activity', feeMinor: 2000, currency: 'USD' } }),
  ]);

  // Each fixture group is its own transaction -- one big interactive
  // transaction doing this many sequential creates has been observed to
  // exceed Prisma's default 5s interactive-transaction timeout against the
  // real Neon DB. Groups only depend on ids from an earlier group, never a
  // later one, so running them as separate sequential transactions is safe.
  const { customizedPackageId, usdAddonId, eurAddonId } = await withOrg(orgId, async (tx) => {
    const customizedPackage = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: testPackageReference(),
        title: `TEST-BOOKING-COST-CUSTOMIZED-${suffix}`,
        description: 'Fixture customized package linked to the main test booking.',
        country: TEST_COUNTRY,
        currency: 'USD',
        status: 'DRAFT',
        durationDays: 1,
      },
    });
    await tx.packageItineraryDay.create({
      data: { organizationId: orgId, tourPackageId: customizedPackage.id, dayNumber: 1, hotelId, restaurantId, activityIds: [activityId] },
    });
    const [usdAddon, eurAddon] = await Promise.all([
      tx.addonService.create({
        data: { organizationId: orgId, code: 'PHOTOGRAPHY', name: 'Photography (USD)', description: 'Fixture add-on.', priceMinor: 5000, currency: 'USD' },
      }),
      tx.addonService.create({
        data: { organizationId: orgId, code: 'TRANSLATOR', name: 'Translator (EUR)', description: 'Fixture add-on.', priceMinor: 3000, currency: 'EUR' },
      }),
    ]);
    return { customizedPackageId: customizedPackage.id, usdAddonId: usdAddon.id, eurAddonId: eurAddon.id };
  });

  await withOrg(orgId, async (tx) => {
    const booking = await tx.booking.create({
      data: {
        organizationId: orgId,
        origin: 'TAILOR_MADE',
        touristUserId: touristId,
        bookingReference: generateBookingReference(),
        seats: 2,
        customCountry: TEST_COUNTRY,
        status: 'AWAITING_QUOTATION',
        customizedPackageId,
      },
    });
    bookingId = booking.id;
    await tx.bookingAddon.create({
      data: { organizationId: orgId, bookingId: booking.id, addonServiceId: usdAddonId, priceMinor: 5000, currency: 'USD' },
    });
  });

  const noAddonsBooking = await withOrg(orgId, (tx) =>
    tx.booking.create({
      data: {
        organizationId: orgId,
        origin: 'TAILOR_MADE',
        touristUserId: touristId,
        bookingReference: generateBookingReference(),
        seats: 1,
        customCountry: TEST_COUNTRY,
        status: 'AWAITING_QUOTATION',
      },
    }),
  );
  noAddonsBookingId = noAddonsBooking.id;

  await withOrg(orgId, async (tx) => {
    const eurAddonBooking = await tx.booking.create({
      data: {
        organizationId: orgId,
        origin: 'TAILOR_MADE',
        touristUserId: touristId,
        bookingReference: generateBookingReference(),
        seats: 1,
        customCountry: TEST_COUNTRY,
        status: 'AWAITING_QUOTATION',
      },
    });
    eurAddonBookingId = eurAddonBooking.id;
    await tx.bookingAddon.create({
      data: { organizationId: orgId, bookingId: eurAddonBooking.id, addonServiceId: eurAddonId, priceMinor: 3000, currency: 'EUR' },
    });
  });

  const predefinedBooking = await withOrg(orgId, (tx) =>
    tx.booking.create({
      data: {
        organizationId: orgId,
        touristUserId: touristId,
        bookingReference: generateBookingReference(),
        seats: 1,
      },
    }),
  );
  predefinedBookingId = predefinedBooking.id;

  const noCountryBooking = await withOrg(orgId, (tx) =>
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
  noCountryBookingId = noCountryBooking.id;

  // A second customized package whose Day Template references a hotel with
  // NO effective HotelRate configured -- the "unresolved day" 409 case.
  await withOrg(orgId, async (tx) => {
    const unpricedPackage = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: testPackageReference(),
        title: `TEST-BOOKING-COST-UNPRICED-${suffix}`,
        description: 'Fixture for the unresolved-rate 409 case.',
        country: TEST_COUNTRY,
        currency: 'USD',
        status: 'DRAFT',
        durationDays: 1,
      },
    });
    await tx.packageItineraryDay.create({
      data: { organizationId: orgId, tourPackageId: unpricedPackage.id, dayNumber: 1, hotelId: unpricedHotelId },
    });
    const unresolvedTemplateBooking = await tx.booking.create({
      data: {
        organizationId: orgId,
        origin: 'TAILOR_MADE',
        touristUserId: touristId,
        bookingReference: generateBookingReference(),
        seats: 1,
        customCountry: TEST_COUNTRY,
        status: 'AWAITING_QUOTATION',
        customizedPackageId: unpricedPackage.id,
      },
    });
    unresolvedTemplateBookingId = unresolvedTemplateBooking.id;
  });
}, 60_000);

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
  // Split into two transactions -- one big interactive transaction doing
  // this many sequential deletes has been observed to exceed Prisma's
  // default 5s interactive-transaction timeout against the real Neon DB.
  await withOrg(orgId, async (tx) => {
    await tx.bookingCostLineItem.deleteMany({ where: { organizationId: orgId } });
    await tx.bookingCostBreakdown.deleteMany({ where: { organizationId: orgId } });
    await tx.bookingAddon.deleteMany({ where: { organizationId: orgId } });
    await tx.booking.deleteMany({ where: { organizationId: orgId } });
    await tx.addonService.deleteMany({ where: { organizationId: orgId } });
  });
  await withOrg(orgId, async (tx) => {
    await tx.packageItineraryDay.deleteMany({ where: { organizationId: orgId } });
    await tx.tourPackage.deleteMany({ where: { organizationId: orgId } });
    await tx.activity.deleteMany({ where: { organizationId: orgId } });
    await tx.site.deleteMany({ where: { organizationId: orgId } });
    await tx.restaurant.deleteMany({ where: { organizationId: orgId } });
    await tx.hotel.deleteMany({ where: { organizationId: orgId } });
  });
  await admin.staffRate.deleteMany({ where: { country: TEST_COUNTRY } });
  await admin.hotelRate.deleteMany({ where: { country: TEST_COUNTRY } });
  await admin.restaurantRate.deleteMany({ where: { country: TEST_COUNTRY } });
  await admin.activityFee.deleteMany({ where: { country: TEST_COUNTRY } });
  await admin.transportRate.deleteMany({ where: { country: TEST_COUNTRY } });
  await admin.immigrationCostRate.deleteMany({ where: { country: TEST_COUNTRY } });
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('PUT /api/v1/bookings/:bookingId/cost-breakdown', () => {
  it(
    'derives accommodation/restaurant/activities from the linked customized package\'s Day Template, computes base cost + selling price inclusive of already-selected add-ons, and does NOT write Booking.priceMinor',
    async () => {
      const headers = await loginAs(operatorId);
      const req = jsonRequest(`http://localhost/api/v1/bookings/${bookingId}/cost-breakdown`, headers, 'PUT', {
        nights: 1,
        driverDays: 4,
        guideDays: 4,
        transportRateId,
        transportDays: 4,
        requiresVisa: false,
        agencyMarginBp: 2000,
      });
      const res = await saveCostBreakdown(req, { params: Promise.resolve({ bookingId }) });
      expect(res.status).toBe(200);
      const { breakdown } = await res.json();
      // referenceGroupSize is the booking's own seats (2):
      // accommodation: 1 hotel-day * 5000 * 2 = 10000
      // restaurant: 1 restaurant-day * 1000 * 2 = 2000
      // activities: 2000 * 2 = 4000
      // staff: 10000*4 + 8000*4 = 72000 (whole-group, unaffected by seats)
      // transport: (3000+500+200+1000) * 4 = 18800 (whole-group)
      // total = 10000 + 2000 + 4000 + 72000 + 18800 = 106800
      expect(breakdown.currency).toBe('USD');
      expect(breakdown.computedAccommodationMinor).toBe(10000);
      expect(breakdown.computedRestaurantMinor).toBe(2000);
      expect(breakdown.computedActivitiesMinor).toBe(4000);
      expect(breakdown.computedBaseCostMinor).toBe(106800);
      expect(breakdown.computedSellingPriceMinor).toBe(128160); // 106800 * 1.2
      expect(breakdown.addonsTotalMinor).toBe(5000);
      expect(breakdown.suggestedTotalMinor).toBe(133160); // 128160 + 5000
      expect(breakdown.overridePriceMinor).toBeNull();

      const booking = await withOrg(orgId, (tx) => tx.booking.findUniqueOrThrow({ where: { id: bookingId } }));
      expect(booking.priceMinor).toBeNull();
      expect(booking.currency).toBeNull();
    },
    60_000,
  );

  it(
    'GET returns the saved breakdown',
    async () => {
      const headers = await loginAs(operatorId);
      const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/cost-breakdown`, { headers });
      const res = await getCostBreakdown(req, { params: Promise.resolve({ bookingId }) });
      expect(res.status).toBe(200);
      const { breakdown } = await res.json();
      expect(breakdown.bookingId).toBe(bookingId);
      expect(breakdown.nights).toBe(1);
    },
    30_000,
  );

  it(
    'an override replaces the suggested total and is audited',
    async () => {
      const headers = await loginAs(operatorId);
      const req = jsonRequest(`http://localhost/api/v1/bookings/${bookingId}/cost-breakdown`, headers, 'PUT', {
        nights: 1,
        driverDays: 4,
        guideDays: 4,
        transportRateId,
        transportDays: 4,
        requiresVisa: false,
        agencyMarginBp: 2000,
        overridePriceMinor: 199999,
        overrideReason: 'Matching a competitor promotion',
      });
      const res = await saveCostBreakdown(req, { params: Promise.resolve({ bookingId }) });
      expect(res.status).toBe(200);
      const { breakdown } = await res.json();
      expect(breakdown.overridePriceMinor).toBe(199999);
      expect(breakdown.overrideReason).toBe('Matching a competitor promotion');
      expect(breakdown.suggestedTotalMinor).toBe(199999);

      const booking = await withOrg(orgId, (tx) => tx.booking.findUniqueOrThrow({ where: { id: bookingId } }));
      expect(booking.priceMinor).toBeNull(); // still not committed -- sendQuotation does that

      const auditEntry = await withOrg(orgId, (tx) =>
        tx.auditLog.findFirst({ where: { action: 'finance.booking_price_overridden', resourceId: bookingId }, orderBy: { createdAt: 'desc' } }),
      );
      expect(auditEntry).not.toBeNull();
    },
    30_000,
  );

  it('409s for a non-TAILOR_MADE booking', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest(`http://localhost/api/v1/bookings/${predefinedBookingId}/cost-breakdown`, headers, 'PUT', {
      nights: 1,
      driverDays: 0,
      guideDays: 0,
      agencyMarginBp: 0,
    });
    const res = await saveCostBreakdown(req, { params: Promise.resolve({ bookingId: predefinedBookingId }) });
    expect(res.status).toBe(409);
  });

  it('409s when the TAILOR_MADE booking has no destination country', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest(`http://localhost/api/v1/bookings/${noCountryBookingId}/cost-breakdown`, headers, 'PUT', {
      nights: 1,
      driverDays: 0,
      guideDays: 0,
      agencyMarginBp: 0,
    });
    const res = await saveCostBreakdown(req, { params: Promise.resolve({ bookingId: noCountryBookingId }) });
    expect(res.status).toBe(409);
  });

  it('409s when the resolved rates disagree in currency', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest(`http://localhost/api/v1/bookings/${noAddonsBookingId}/cost-breakdown`, headers, 'PUT', {
      nights: 1,
      driverDays: 1, // resolves the USD driver rate
      guideDays: 0,
      requiresVisa: true,
      immigrationCostRateId: eurImmigrationRateId, // EUR -- disagrees
      agencyMarginBp: 0,
    });
    const res = await saveCostBreakdown(req, { params: Promise.resolve({ bookingId: noAddonsBookingId }) });
    expect(res.status).toBe(409);
  });

  it('409s when zero rates and zero add-ons resolve, even with an override', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest(`http://localhost/api/v1/bookings/${noAddonsBookingId}/cost-breakdown`, headers, 'PUT', {
      nights: 0,
      driverDays: 0,
      guideDays: 0,
      agencyMarginBp: 0,
      overridePriceMinor: 5000,
      overrideReason: 'Hand-typed, no cost context at all',
    });
    const res = await saveCostBreakdown(req, { params: Promise.resolve({ bookingId: noAddonsBookingId }) });
    expect(res.status).toBe(409);
  });

  it('succeeds with zero rates but one already-selected add-on -- currency derived from the add-on', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest(`http://localhost/api/v1/bookings/${eurAddonBookingId}/cost-breakdown`, headers, 'PUT', {
      nights: 0,
      driverDays: 0,
      guideDays: 0,
      agencyMarginBp: 0,
    });
    const res = await saveCostBreakdown(req, { params: Promise.resolve({ bookingId: eurAddonBookingId }) });
    expect(res.status).toBe(200);
    const { breakdown } = await res.json();
    expect(breakdown.currency).toBe('EUR');
    expect(breakdown.computedBaseCostMinor).toBe(0);
    expect(breakdown.addonsTotalMinor).toBe(3000);
    expect(breakdown.suggestedTotalMinor).toBe(3000);
  });

  it('409s when the linked customized package\'s Day Template has a hotel with no effective HotelRate configured', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest(`http://localhost/api/v1/bookings/${unresolvedTemplateBookingId}/cost-breakdown`, headers, 'PUT', {
      nights: 1,
      driverDays: 0,
      guideDays: 0,
      agencyMarginBp: 0,
    });
    const res = await saveCostBreakdown(req, { params: Promise.resolve({ bookingId: unresolvedTemplateBookingId }) });
    expect(res.status).toBe(409);
  });

  it.each(['COMPLETED', 'CANCELLED', 'REFUNDED'] as const)('rejects saving a cost breakdown once the booking is %s (409)', async (status) => {
    const lockedBooking = await withOrg(orgId, (tx) =>
      tx.booking.create({
        data: {
          organizationId: orgId,
          origin: 'TAILOR_MADE',
          touristUserId: touristId,
          bookingReference: generateBookingReference(),
          seats: 1,
          customCountry: TEST_COUNTRY,
          status,
        },
      }),
    );
    const headers = await loginAs(operatorId);
    const req = jsonRequest(`http://localhost/api/v1/bookings/${lockedBooking.id}/cost-breakdown`, headers, 'PUT', {
      nights: 1,
      driverDays: 0,
      guideDays: 0,
      agencyMarginBp: 0,
    });
    const res = await saveCostBreakdown(req, { params: Promise.resolve({ bookingId: lockedBooking.id }) });
    expect(res.status).toBe(409);
  });
});

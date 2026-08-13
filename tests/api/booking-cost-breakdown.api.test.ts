import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { generateBookingReference } from '@modules/booking';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { GET as getCostBreakdown, PUT as saveCostBreakdown } from '../../src/app/api/v1/bookings/[bookingId]/cost-breakdown/route';

/**
 * DR-092 -- a TAILOR_MADE booking's cost breakdown: same cost-plus engine as
 * the package flow (DR-039), but currency is derived (not caller-supplied),
 * referenceGroupSize is the booking's own seat count, already-selected
 * add-ons fold into the suggested total, and NOTHING gets written to
 * Booking.priceMinor/currency -- this only computes a suggestion.
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;
const TEST_COUNTRY = 'ZV'; // fictitious, avoids colliding with real seeded rows

let orgId: string;
let operatorId: string;
let touristId: string;
let bookingId: string; // seats=2, one USD add-on already selected
let noAddonsBookingId: string; // seats=1, no add-ons, no rates ever referenced
let eurAddonBookingId: string; // seats=1, one EUR add-on, no rates ever referenced
let predefinedBookingId: string; // origin PREDEFINED_PACKAGE
let noCountryBookingId: string; // TAILOR_MADE but customCountry unset
let hotelRateId: string;
let transportRateId: string;
let eurImmigrationRateId: string;

function jsonRequest(url: string, headers: Headers, method: string, body?: unknown): NextRequest {
  const h = new Headers(headers);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeAll(async () => {
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
    admin.foodBeverageRate.create({ data: { country: TEST_COUNTRY, category: 'BREAKFAST', perUnitMinor: 1000, currency: 'USD' } }),
    admin.foodBeverageRate.create({ data: { country: TEST_COUNTRY, category: 'LUNCH', perUnitMinor: 1500, currency: 'USD' } }),
    admin.foodBeverageRate.create({ data: { country: TEST_COUNTRY, category: 'DINNER', perUnitMinor: 2000, currency: 'USD' } }),
  ]);
  const [hotelRate, transportRate, eurImmigrationRate] = await Promise.all([
    admin.hotelRate.create({ data: { country: TEST_COUNTRY, roomCategory: 'Standard', nightlyRateMinor: 5000, currency: 'USD' } }),
    admin.transportRate.create({
      data: { country: TEST_COUNTRY, fuelEstimateMinor: 3000, tollFeesMinor: 500, parkingFeesMinor: 200, vehicleOperatingCostMinor: 1000, currency: 'USD' },
    }),
    // Deliberately a different currency than every other TEST_COUNTRY rate --
    // fixture for the "resolved rates disagree in currency" 409 case.
    admin.immigrationCostRate.create({
      data: { country: TEST_COUNTRY, visaFeeMinor: 1000, processingFeeMinor: 0, invitationLetterFeeMinor: 0, borderPermitFeeMinor: 0, currency: 'EUR' },
    }),
  ]);
  hotelRateId = hotelRate.id;
  transportRateId = transportRate.id;
  eurImmigrationRateId = eurImmigrationRate.id;

  await withOrg(orgId, async (tx) => {
    const [usdAddon, eurAddon] = await Promise.all([
      tx.addonService.create({
        data: { organizationId: orgId, code: 'PHOTOGRAPHY', name: 'Photography (USD)', description: 'Fixture add-on.', priceMinor: 5000, currency: 'USD' },
      }),
      tx.addonService.create({
        data: { organizationId: orgId, code: 'TRANSLATOR', name: 'Translator (EUR)', description: 'Fixture add-on.', priceMinor: 3000, currency: 'EUR' },
      }),
    ]);

    const booking = await tx.booking.create({
      data: {
        organizationId: orgId,
        origin: 'TAILOR_MADE',
        touristUserId: touristId,
        bookingReference: generateBookingReference(),
        seats: 2,
        customCountry: TEST_COUNTRY,
        status: 'AWAITING_QUOTATION',
      },
    });
    bookingId = booking.id;
    await tx.bookingAddon.create({
      data: { organizationId: orgId, bookingId: booking.id, addonServiceId: usdAddon.id, priceMinor: 5000, currency: 'USD' },
    });

    const noAddonsBooking = await tx.booking.create({
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
    noAddonsBookingId = noAddonsBooking.id;

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
      data: { organizationId: orgId, bookingId: eurAddonBooking.id, addonServiceId: eurAddon.id, priceMinor: 3000, currency: 'EUR' },
    });

    const predefinedBooking = await tx.booking.create({
      data: {
        organizationId: orgId,
        touristUserId: touristId,
        bookingReference: generateBookingReference(),
        seats: 1,
      },
    });
    predefinedBookingId = predefinedBooking.id;

    const noCountryBooking = await tx.booking.create({
      data: {
        organizationId: orgId,
        origin: 'TAILOR_MADE',
        touristUserId: touristId,
        bookingReference: generateBookingReference(),
        seats: 1,
        status: 'AWAITING_QUOTATION',
      },
    });
    noCountryBookingId = noCountryBooking.id;
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
    await tx.bookingCostLineItem.deleteMany({ where: { organizationId: orgId } });
    await tx.bookingCostBreakdown.deleteMany({ where: { organizationId: orgId } });
    await tx.bookingAddon.deleteMany({ where: { organizationId: orgId } });
    await tx.booking.deleteMany({ where: { organizationId: orgId } });
    await tx.addonService.deleteMany({ where: { organizationId: orgId } });
  });
  await admin.staffRate.deleteMany({ where: { country: TEST_COUNTRY } });
  await admin.hotelRate.deleteMany({ where: { country: TEST_COUNTRY } });
  await admin.transportRate.deleteMany({ where: { country: TEST_COUNTRY } });
  await admin.foodBeverageRate.deleteMany({ where: { country: TEST_COUNTRY } });
  await admin.immigrationCostRate.deleteMany({ where: { country: TEST_COUNTRY } });
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('PUT /api/v1/bookings/:bookingId/cost-breakdown', () => {
  it(
    'computes base cost + selling price inclusive of already-selected add-ons, and does NOT write Booking.priceMinor',
    async () => {
      const headers = await loginAs(operatorId);
      const req = jsonRequest(`http://localhost/api/v1/bookings/${bookingId}/cost-breakdown`, headers, 'PUT', {
        nights: 4,
        driverDays: 4,
        guideDays: 4,
        hotelRateId,
        roomsNeeded: 5,
        breakfastCount: 4,
        lunchCount: 4,
        dinnerCount: 4,
        transportRateId,
        transportDays: 4,
        requiresVisa: false,
        agencyMarginBp: 2000,
      });
      const res = await saveCostBreakdown(req, { params: Promise.resolve({ bookingId }) });
      expect(res.status).toBe(200);
      const { breakdown } = await res.json();
      // Same rates as tests/api/package-cost-breakdown.api.test.ts, but
      // referenceGroupSize here is the booking's own seats (2), not 10 --
      // accommodation/transport/staff are whole-group and unaffected;
      // restaurant scales with seats: (1000+1500+2000)*4 * 2 = 36000.
      expect(breakdown.currency).toBe('USD');
      expect(breakdown.computedBaseCostMinor).toBe(226800);
      expect(breakdown.computedSellingPriceMinor).toBe(272160); // 226800 * 1.2
      expect(breakdown.addonsTotalMinor).toBe(5000);
      expect(breakdown.suggestedTotalMinor).toBe(277160); // 272160 + 5000
      expect(breakdown.overridePriceMinor).toBeNull();

      const booking = await withOrg(orgId, (tx) => tx.booking.findUniqueOrThrow({ where: { id: bookingId } }));
      expect(booking.priceMinor).toBeNull();
      expect(booking.currency).toBeNull();
    },
    30_000,
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
      expect(breakdown.nights).toBe(4);
    },
    30_000,
  );

  it(
    'an override replaces the suggested total and is audited',
    async () => {
      const headers = await loginAs(operatorId);
      const req = jsonRequest(`http://localhost/api/v1/bookings/${bookingId}/cost-breakdown`, headers, 'PUT', {
        nights: 4,
        driverDays: 4,
        guideDays: 4,
        hotelRateId,
        roomsNeeded: 5,
        breakfastCount: 4,
        lunchCount: 4,
        dinnerCount: 4,
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

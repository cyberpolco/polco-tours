import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { testPackageReference } from '../helpers/package-reference';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { GET as getCostBreakdown, PUT as saveCostBreakdown } from '../../src/app/api/v1/catalog/packages/[packageId]/cost-breakdown/route';

/**
 * Finance Module (DR-039) -- full flow: rates exist, a package's cost
 * breakdown is saved, TourPackage.priceMinor is computed from it, and an
 * override replaces that computed price while being audited.
 *
 * DR-131: accommodation/restaurant/activities are no longer staff-picked
 * inputs here -- they're derived from the package's own Day Template
 * (PackageItineraryDay.hotelId/restaurantId/activityIds), resolved against
 * HotelRate/RestaurantRate/ActivityFee by entity id + effective date.
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;
const TEST_COUNTRY = 'ZZ';

let orgId: string;
let operatorId: string;
let tourPackageId: string; // has a 4-day template: days 1-3 have hotel+restaurant, day 1 & 3 also have an activity, day 4 is bare
let unpricedTemplatePackageId: string; // 1-day template with a hotel but no HotelRate configured for it
let transportRateId: string;

function jsonRequest(url: string, headers: Headers, method: string, body?: unknown): NextRequest {
  const h = new Headers(headers);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `PKG-COST-BREAKDOWN-TEST-${suffix}`, countries: [TEST_COUNTRY], status: 'VERIFIED' },
  });
  orgId = org.id;

  const operator = await admin.user.create({
    data: { email: `op-cost-breakdown-${suffix}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId },
  });
  operatorId = operator.id;

  // Rates are platform-wide (no org scoping) -- created via the raw admin
  // client directly, split from the org-scoped writes below.
  await Promise.all([
    admin.staffRate.create({ data: { country: TEST_COUNTRY, role: 'DRIVER', dailyRateMinor: 10000, currency: 'USD' } }),
    admin.staffRate.create({ data: { country: TEST_COUNTRY, role: 'GUIDE', dailyRateMinor: 8000, currency: 'USD' } }),
  ]);
  const transportRate = await admin.transportRate.create({
    data: { country: TEST_COUNTRY, fuelEstimateMinor: 3000, tollFeesMinor: 500, parkingFeesMinor: 200, vehicleOperatingCostMinor: 1000, currency: 'USD' },
  });
  transportRateId = transportRate.id;

  // Entities are created in their own transaction, awaited to commit, before
  // any admin.*Rate.create() references them by id below -- admin is a
  // separate PrismaClient/connection from `tx`, so referencing a row still
  // inside an open withOrg transaction would race the FK check against it.
  const { hotelId, restaurantId, activity1Id, activity2Id, unpricedHotelId } = await withOrg(orgId, async (tx) => {
    const hotel = await tx.hotel.create({ data: { organizationId: orgId, name: `Fixture Hotel ${suffix}`, country: TEST_COUNTRY } });
    const restaurant = await tx.restaurant.create({ data: { organizationId: orgId, name: `Fixture Restaurant ${suffix}`, country: TEST_COUNTRY } });
    const site = await tx.site.create({ data: { organizationId: orgId, name: `Fixture Site ${suffix}`, country: TEST_COUNTRY, province: 'Fixture' } });
    const activity1 = await tx.activity.create({ data: { organizationId: orgId, siteId: site.id, name: 'Fixture activity 1' } });
    const activity2 = await tx.activity.create({ data: { organizationId: orgId, siteId: site.id, name: 'Fixture activity 2' } });
    const unpricedHotel = await tx.hotel.create({ data: { organizationId: orgId, name: `Unpriced Hotel ${suffix}`, country: TEST_COUNTRY } });
    return { hotelId: hotel.id, restaurantId: restaurant.id, activity1Id: activity1.id, activity2Id: activity2.id, unpricedHotelId: unpricedHotel.id };
  });

  await Promise.all([
    admin.hotelRate.create({ data: { country: TEST_COUNTRY, hotelId, roomCategory: 'Standard', nightlyRateMinor: 5000, currency: 'USD' } }),
    admin.restaurantRate.create({ data: { country: TEST_COUNTRY, restaurantId, dailyRateMinor: 1000, currency: 'USD' } }),
    admin.activityFee.create({ data: { country: TEST_COUNTRY, activityId: activity1Id, name: 'Fixture activity 1', feeMinor: 3000, currency: 'USD' } }),
    admin.activityFee.create({ data: { country: TEST_COUNTRY, activityId: activity2Id, name: 'Fixture activity 2', feeMinor: 2000, currency: 'USD' } }),
  ]);

  await withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: testPackageReference(),
        title: `TEST-COST-BREAKDOWN-${suffix}`,
        description: 'Fixture for cost breakdown tests.',
        country: TEST_COUNTRY,
        currency: 'USD',
        status: 'DRAFT',
        durationDays: 4,
      },
    });
    tourPackageId = pkg.id;

    await tx.packageItineraryDay.createMany({
      data: [
        { organizationId: orgId, tourPackageId: pkg.id, dayNumber: 1, hotelId, restaurantId, activityIds: [activity1Id] },
        { organizationId: orgId, tourPackageId: pkg.id, dayNumber: 2, hotelId, restaurantId, activityIds: [] },
        { organizationId: orgId, tourPackageId: pkg.id, dayNumber: 3, hotelId, restaurantId, activityIds: [activity2Id] },
        { organizationId: orgId, tourPackageId: pkg.id, dayNumber: 4, activityIds: [] },
      ],
    });

    // A second package whose Day Template references a hotel with NO
    // effective HotelRate configured -- the "unresolved day" 409 case.
    const unpricedPkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: testPackageReference(),
        title: `TEST-COST-BREAKDOWN-UNPRICED-${suffix}`,
        description: 'Fixture for the unresolved-rate 409 case.',
        country: TEST_COUNTRY,
        currency: 'USD',
        status: 'DRAFT',
        durationDays: 1,
      },
    });
    unpricedTemplatePackageId = unpricedPkg.id;
    await tx.packageItineraryDay.create({
      data: { organizationId: orgId, tourPackageId: unpricedPkg.id, dayNumber: 1, hotelId: unpricedHotelId },
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
  // Split into two transactions -- one big interactive transaction doing
  // this many sequential deletes has been observed to exceed Prisma's
  // default 5s interactive-transaction timeout against the real Neon DB.
  await withOrg(orgId, async (tx) => {
    await tx.packageCostLineItem.deleteMany({ where: { organizationId: orgId } });
    await tx.packageCostBreakdown.deleteMany({ where: { organizationId: orgId } });
    await tx.packageItineraryDay.deleteMany({ where: { organizationId: orgId } });
    await tx.tourPackage.deleteMany({ where: { organizationId: orgId } });
  });
  await withOrg(orgId, async (tx) => {
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
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('PUT /api/v1/catalog/packages/:packageId/cost-breakdown', () => {
  it(
    'derives accommodation/restaurant/activities from the Day Template, computes the base cost, selling price, and per-seat price, and updates TourPackage.priceMinor',
    async () => {
      const headers = await loginAs(operatorId);
      const req = jsonRequest(`http://localhost/api/v1/catalog/packages/${tourPackageId}/cost-breakdown`, headers, 'PUT', {
        currency: 'USD',
        referenceGroupSize: 10,
        nights: 4,
        driverDays: 4,
        guideDays: 4,
        transportRateId,
        transportDays: 4,
        requiresVisa: false,
        agencyMarginBp: 2000,
      });
      const res = await saveCostBreakdown(req, { params: Promise.resolve({ packageId: tourPackageId }) });
      expect(res.status).toBe(200);
      const { breakdown } = await res.json();
      // accommodation: 3 hotel-days * 5000 * 10 people = 150000
      // restaurant: 3 restaurant-days * 1000 * 10 people = 30000
      // activities: (3000 + 2000) * 10 people = 50000
      // staff: 10000*4 + 8000*4 = 72000
      // transport: (3000+500+200+1000) * 4 = 18800
      // total = 150000 + 30000 + 50000 + 72000 + 18800 = 320800
      expect(breakdown.computedAccommodationMinor).toBe(150000);
      expect(breakdown.computedRestaurantMinor).toBe(30000);
      expect(breakdown.computedActivitiesMinor).toBe(50000);
      expect(breakdown.computedBaseCostMinor).toBe(320800);
      expect(breakdown.computedSellingPriceMinor).toBe(384960); // 320800 * 1.2
      expect(breakdown.overridePriceMinor).toBeNull();

      const pkg = await withOrg(orgId, (tx) => tx.tourPackage.findUniqueOrThrow({ where: { id: tourPackageId } }));
      expect(pkg.priceMinor).toBe(Math.ceil(384960 / 10)); // 38496
    },
    30_000,
  );

  it(
    'GET returns the saved breakdown',
    async () => {
      const headers = await loginAs(operatorId);
      const req = new NextRequest(`http://localhost/api/v1/catalog/packages/${tourPackageId}/cost-breakdown`, { headers });
      const res = await getCostBreakdown(req, { params: Promise.resolve({ packageId: tourPackageId }) });
      expect(res.status).toBe(200);
      const { breakdown } = await res.json();
      expect(breakdown.tourPackageId).toBe(tourPackageId);
      expect(breakdown.nights).toBe(4);
    },
    30_000,
  );

  it(
    'an override replaces the computed price and is audited',
    async () => {
      const headers = await loginAs(operatorId);
      const req = jsonRequest(`http://localhost/api/v1/catalog/packages/${tourPackageId}/cost-breakdown`, headers, 'PUT', {
        currency: 'USD',
        referenceGroupSize: 10,
        nights: 4,
        driverDays: 4,
        guideDays: 4,
        transportRateId,
        transportDays: 4,
        requiresVisa: false,
        agencyMarginBp: 2000,
        overridePriceMinor: 39999,
        overrideReason: 'Matching a competitor promotion',
      });
      const res = await saveCostBreakdown(req, { params: Promise.resolve({ packageId: tourPackageId }) });
      expect(res.status).toBe(200);
      const { breakdown } = await res.json();
      expect(breakdown.overridePriceMinor).toBe(39999);
      expect(breakdown.overrideReason).toBe('Matching a competitor promotion');

      const pkg = await withOrg(orgId, (tx) => tx.tourPackage.findUniqueOrThrow({ where: { id: tourPackageId } }));
      expect(pkg.priceMinor).toBe(39999);

      const auditEntry = await withOrg(orgId, (tx) =>
        tx.auditLog.findFirst({ where: { action: 'finance.price_overridden', resourceId: tourPackageId }, orderBy: { createdAt: 'desc' } }),
      );
      expect(auditEntry).not.toBeNull();
    },
    30_000,
  );

  it(
    'rejects a cost breakdown whose currency does not match the package (422)',
    async () => {
      const headers = await loginAs(operatorId);
      const req = jsonRequest(`http://localhost/api/v1/catalog/packages/${tourPackageId}/cost-breakdown`, headers, 'PUT', {
        currency: 'EUR', // package is USD
        referenceGroupSize: 10,
        nights: 1,
        driverDays: 0,
        guideDays: 0,
        agencyMarginBp: 0,
      });
      const res = await saveCostBreakdown(req, { params: Promise.resolve({ packageId: tourPackageId }) });
      expect(res.status).toBe(422);
    },
    30_000,
  );

  it(
    '409s when a Day Template day has a hotel assigned with no effective HotelRate configured',
    async () => {
      const headers = await loginAs(operatorId);
      const req = jsonRequest(`http://localhost/api/v1/catalog/packages/${unpricedTemplatePackageId}/cost-breakdown`, headers, 'PUT', {
        currency: 'USD',
        referenceGroupSize: 10,
        nights: 1,
        driverDays: 0,
        guideDays: 0,
        agencyMarginBp: 0,
      });
      const res = await saveCostBreakdown(req, { params: Promise.resolve({ packageId: unpricedTemplatePackageId }) });
      expect(res.status).toBe(409);
    },
    30_000,
  );
});

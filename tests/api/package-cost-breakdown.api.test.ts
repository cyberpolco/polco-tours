import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { formatPackageReference } from '@modules/catalog';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { GET as getCostBreakdown, PUT as saveCostBreakdown } from '../../src/app/api/v1/catalog/packages/[packageId]/cost-breakdown/route';

/**
 * Finance Module (DR-039) -- full flow: rates exist, a package's cost
 * breakdown is saved, TourPackage.priceMinor is computed from it, and an
 * override replaces that computed price while being audited.
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;
const TEST_COUNTRY = 'ZZ';

let orgId: string;
let operatorId: string;
let tourPackageId: string;
let hotelRateId: string;
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
    admin.foodBeverageRate.create({ data: { country: TEST_COUNTRY, category: 'BREAKFAST', perUnitMinor: 1000, currency: 'USD' } }),
    admin.foodBeverageRate.create({ data: { country: TEST_COUNTRY, category: 'LUNCH', perUnitMinor: 1500, currency: 'USD' } }),
    admin.foodBeverageRate.create({ data: { country: TEST_COUNTRY, category: 'DINNER', perUnitMinor: 2000, currency: 'USD' } }),
  ]);
  const [hotelRate, transportRate] = await Promise.all([
    admin.hotelRate.create({ data: { country: TEST_COUNTRY, roomCategory: 'Standard', nightlyRateMinor: 5000, currency: 'USD' } }),
    admin.transportRate.create({
      data: { country: TEST_COUNTRY, fuelEstimateMinor: 3000, tollFeesMinor: 500, parkingFeesMinor: 200, vehicleOperatingCostMinor: 1000, currency: 'USD' },
    }),
  ]);
  hotelRateId = hotelRate.id;
  transportRateId = transportRate.id;

  await withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: formatPackageReference(Date.now()),
        title: `TEST-COST-BREAKDOWN-${suffix}`,
        description: 'Fixture for cost breakdown tests.',
        country: TEST_COUNTRY,
        currency: 'USD',
        status: 'DRAFT',
      },
    });
    tourPackageId = pkg.id;
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
    await tx.packageCostLineItem.deleteMany({ where: { organizationId: orgId } });
    await tx.packageCostBreakdown.deleteMany({ where: { organizationId: orgId } });
    await tx.tourPackage.deleteMany({ where: { organizationId: orgId } });
  });
  await admin.staffRate.deleteMany({ where: { country: TEST_COUNTRY } });
  await admin.hotelRate.deleteMany({ where: { country: TEST_COUNTRY } });
  await admin.transportRate.deleteMany({ where: { country: TEST_COUNTRY } });
  await admin.foodBeverageRate.deleteMany({ where: { country: TEST_COUNTRY } });
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('PUT /api/v1/catalog/packages/:packageId/cost-breakdown', () => {
  it(
    'computes the base cost, selling price, and per-seat price, and updates TourPackage.priceMinor',
    async () => {
      const headers = await loginAs(operatorId);
      const req = jsonRequest(`http://localhost/api/v1/catalog/packages/${tourPackageId}/cost-breakdown`, headers, 'PUT', {
        currency: 'USD',
        referenceGroupSize: 10,
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
      const res = await saveCostBreakdown(req, { params: Promise.resolve({ packageId: tourPackageId }) });
      expect(res.status).toBe(200);
      const { breakdown } = await res.json();
      // Same math as tests/finance.domain.test.ts's worked example.
      expect(breakdown.computedBaseCostMinor).toBe(370800);
      expect(breakdown.computedSellingPriceMinor).toBe(444960); // 370800 * 1.2
      expect(breakdown.overridePriceMinor).toBeNull();

      const pkg = await withOrg(orgId, (tx) => tx.tourPackage.findUniqueOrThrow({ where: { id: tourPackageId } }));
      expect(pkg.priceMinor).toBe(Math.ceil(444960 / 10)); // 44496
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
        hotelRateId,
        roomsNeeded: 5,
        breakfastCount: 4,
        lunchCount: 4,
        dinnerCount: 4,
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
});

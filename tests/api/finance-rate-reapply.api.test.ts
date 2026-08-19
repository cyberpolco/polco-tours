import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { generateBookingReference } from '@modules/booking';
import { testPackageReference } from '../helpers/package-reference';
import { prisma, withOrg } from '../../src/lib/db';
import { getEffectivePlatformRate } from '../../src/lib/platform-rate';
import { loginAs } from '../helpers/test-auth';
import { PATCH as patchTransportRate } from '../../src/app/api/v1/finance/rates/transport/[id]/route';
import { PUT as savePackageCostBreakdown } from '../../src/app/api/v1/catalog/packages/[packageId]/cost-breakdown/route';
import { PUT as saveBookingCostBreakdown } from '../../src/app/api/v1/bookings/[bookingId]/cost-breakdown/route';

/**
 * Explicit user request: SUPERADMIN can update an Operational Rate's price
 * in place (not just delete-and-recreate it), and once saved, every
 * existing package/tailor-made-booking cost breakdown is recomputed against
 * the new price (financeService.reapplyRatesToAllCostBreakdowns). This file
 * proves the sweep end-to-end using TransportRate -- the simplest rate to
 * fixture since it needs no Day Template.
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;
const TEST_COUNTRY = 'ZY'; // fictitious, avoids colliding with real seeded rows
const TAX_RATE_BP = 1000; // 10%, isolated from whatever real TaxRate rows exist

let orgId: string;
let operatorId: string;
let superadminId: string;
let touristId: string;
let transportRateId: string;
let plainPackageId: string; // no override -- TourPackage.priceMinor should move with the rate
let overriddenPackageId: string; // has a staff price override -- priceMinor must NOT move
let overridePriceMinor: number;
let bookingId: string; // TAILOR_MADE, still open -- should recompute
let cancelledBookingId: string; // TAILOR_MADE, goes CANCELLED after its breakdown is saved -- should be skipped
let platformFeeRateBp: number;

function jsonRequest(url: string, headers: Headers, method: string, body?: unknown): NextRequest {
  const h = new Headers(headers);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

function expectedPriceMinor(baseCostMinor: number, agencyMarginBp: number, taxRateBp: number, feeRateBp: number, referenceGroupSize: number): number {
  const sellingPriceMinor = Math.round(baseCostMinor * (1 + agencyMarginBp / 10000));
  const taxMinor = Math.round((sellingPriceMinor * taxRateBp) / 10000);
  const preFeeTotal = sellingPriceMinor + taxMinor;
  const platformFeeMinor = Math.round((preFeeTotal * feeRateBp) / 10000);
  const totalMinor = preFeeTotal + platformFeeMinor;
  return Math.ceil(totalMinor / referenceGroupSize);
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `FINANCE-RATE-REAPPLY-TEST-${suffix}`, countries: [TEST_COUNTRY], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [operator, superadmin, tourist] = await Promise.all([
    admin.user.create({ data: { email: `op-rate-reapply-${suffix}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `superadmin-rate-reapply-${suffix}@example.test`, role: 'SUPERADMIN', organizationId: orgId } }),
    admin.user.create({ data: { email: `tourist-rate-reapply-${suffix}@example.test`, role: 'TOURIST', organizationId: orgId } }),
  ]);
  operatorId = operator.id;
  superadminId = superadmin.id;
  touristId = tourist.id;

  await admin.taxRate.create({ data: { country: TEST_COUNTRY, taxType: 'VAT', rateBp: TAX_RATE_BP } });
  ({ rateBp: platformFeeRateBp } = await getEffectivePlatformRate());

  const transportRate = await admin.transportRate.create({
    data: { country: TEST_COUNTRY, fuelEstimateMinor: 3000, tollFeesMinor: 500, parkingFeesMinor: 200, vehicleOperatingCostMinor: 1000, currency: 'USD' },
  });
  transportRateId = transportRate.id;

  await withOrg(orgId, async (tx) => {
    const plainPackage = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: testPackageReference(),
        title: `TEST-RATE-REAPPLY-PLAIN-${suffix}`,
        description: 'Fixture package with no price override.',
        country: TEST_COUNTRY,
        currency: 'USD',
        status: 'DRAFT',
        durationDays: 1,
      },
    });
    plainPackageId = plainPackage.id;

    const overriddenPackage = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: testPackageReference(),
        title: `TEST-RATE-REAPPLY-OVERRIDE-${suffix}`,
        description: 'Fixture package with a staff price override.',
        country: TEST_COUNTRY,
        currency: 'USD',
        status: 'DRAFT',
        durationDays: 1,
      },
    });
    overriddenPackageId = overriddenPackage.id;

    const booking = await tx.booking.create({
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
    bookingId = booking.id;

    const cancelledBooking = await tx.booking.create({
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
    cancelledBookingId = cancelledBooking.id;
  });

  // Save every fixture's cost breakdown through the real routes -- transport
  // only (no driver/guide/accommodation), transportDays=2, agencyMarginBp=0,
  // referenceGroupSize=1 -- so base cost is exactly the transport bucket.
  const operatorHeaders = await loginAs(operatorId);
  const plainReq = jsonRequest(`http://localhost/api/v1/catalog/packages/${plainPackageId}/cost-breakdown`, operatorHeaders, 'PUT', {
    currency: 'USD',
    referenceGroupSize: 1,
    nights: 1,
    driverDays: 0,
    guideDays: 0,
    transportRateId,
    transportDays: 2,
    agencyMarginBp: 0,
  });
  const plainRes = await savePackageCostBreakdown(plainReq, { params: Promise.resolve({ packageId: plainPackageId }) });
  if (plainRes.status !== 200) throw new Error(`fixture setup failed: plain package breakdown ${plainRes.status}`);

  overridePriceMinor = 77777;
  const overrideReq = jsonRequest(`http://localhost/api/v1/catalog/packages/${overriddenPackageId}/cost-breakdown`, operatorHeaders, 'PUT', {
    currency: 'USD',
    referenceGroupSize: 1,
    nights: 1,
    driverDays: 0,
    guideDays: 0,
    transportRateId,
    transportDays: 2,
    agencyMarginBp: 0,
    overridePriceMinor,
    overrideReason: 'Fixture override -- must survive a rate update untouched',
  });
  const overrideRes = await savePackageCostBreakdown(overrideReq, { params: Promise.resolve({ packageId: overriddenPackageId }) });
  if (overrideRes.status !== 200) throw new Error(`fixture setup failed: overridden package breakdown ${overrideRes.status}`);

  const bookingReq = jsonRequest(`http://localhost/api/v1/bookings/${bookingId}/cost-breakdown`, operatorHeaders, 'PUT', {
    nights: 1,
    driverDays: 0,
    guideDays: 0,
    transportRateId,
    transportDays: 2,
    agencyMarginBp: 0,
  });
  const bookingRes = await saveBookingCostBreakdown(bookingReq, { params: Promise.resolve({ bookingId }) });
  if (bookingRes.status !== 200) throw new Error(`fixture setup failed: booking breakdown ${bookingRes.status}`);

  const cancelledBookingReq = jsonRequest(`http://localhost/api/v1/bookings/${cancelledBookingId}/cost-breakdown`, operatorHeaders, 'PUT', {
    nights: 1,
    driverDays: 0,
    guideDays: 0,
    transportRateId,
    transportDays: 2,
    agencyMarginBp: 0,
  });
  const cancelledBookingRes = await saveBookingCostBreakdown(cancelledBookingReq, { params: Promise.resolve({ bookingId: cancelledBookingId }) });
  if (cancelledBookingRes.status !== 200) throw new Error(`fixture setup failed: cancelled-booking breakdown ${cancelledBookingRes.status}`);

  // Goes terminal AFTER its breakdown already exists -- the reapply sweep
  // must skip it (isBookingLocked), not fail the whole sweep.
  await withOrg(orgId, (tx) => tx.booking.update({ where: { id: cancelledBookingId }, data: { status: 'CANCELLED' } }));
}, 180_000);

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
    await tx.booking.deleteMany({ where: { organizationId: orgId } });
    await tx.packageCostLineItem.deleteMany({ where: { organizationId: orgId } });
    await tx.packageCostBreakdown.deleteMany({ where: { organizationId: orgId } });
    await tx.tourPackage.deleteMany({ where: { organizationId: orgId } });
  });
  await admin.transportRate.deleteMany({ where: { country: TEST_COUNTRY } });
  await admin.taxRate.deleteMany({ where: { country: TEST_COUNTRY } });
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('PATCH /api/v1/finance/rates/transport/:id -- reapply to all cost breakdowns', () => {
  it(
    'raising the transport rate recomputes the plain package/booking, leaves the overridden package\'s price untouched, and skips a since-cancelled booking',
    async () => {
      const oldBaseCostMinor = (3000 + 500 + 200 + 1000) * 2; // 9400
      const newBaseCostMinor = (6000 + 500 + 200 + 1000) * 2; // 15400 -- fuel raised from 3000 to 6000

      const oldPlainPriceMinor = expectedPriceMinor(oldBaseCostMinor, 0, TAX_RATE_BP, platformFeeRateBp, 1);
      const plainPkgBefore = await withOrg(orgId, (tx) => tx.tourPackage.findUniqueOrThrow({ where: { id: plainPackageId } }));
      expect(plainPkgBefore.priceMinor).toBe(oldPlainPriceMinor);

      const overriddenPkgBefore = await withOrg(orgId, (tx) => tx.tourPackage.findUniqueOrThrow({ where: { id: overriddenPackageId } }));
      expect(overriddenPkgBefore.priceMinor).toBe(overridePriceMinor);

      const cancelledBookingBreakdownBefore = await withOrg(orgId, (tx) => tx.bookingCostBreakdown.findUniqueOrThrow({ where: { bookingId: cancelledBookingId } }));
      expect(cancelledBookingBreakdownBefore.computedBaseCostMinor).toBe(oldBaseCostMinor);

      const headers = await loginAs(superadminId);
      const req = jsonRequest(`http://localhost/api/v1/finance/rates/transport/${transportRateId}`, headers, 'PATCH', {
        country: TEST_COUNTRY,
        fuelEstimateMinor: 6000,
        tollFeesMinor: 500,
        parkingFeesMinor: 200,
        vehicleOperatingCostMinor: 1000,
        currency: 'USD',
      });
      const res = await patchTransportRate(req, { params: Promise.resolve({ id: transportRateId }) });
      expect(res.status).toBe(200);
      const { rate, reapply } = await res.json();
      expect(rate.fuelEstimateMinor).toBe(6000);
      expect(reapply.packagesUpdated).toBeGreaterThanOrEqual(2);
      expect(reapply.bookingsUpdated).toBeGreaterThanOrEqual(1);
      expect(reapply.bookingsSkipped.some((s: { bookingId: string }) => s.bookingId === cancelledBookingId)).toBe(true);

      // Plain package: base cost and TourPackage.priceMinor both move with
      // the new rate.
      const plainBreakdownAfter = await withOrg(orgId, (tx) => tx.packageCostBreakdown.findUniqueOrThrow({ where: { tourPackageId: plainPackageId } }));
      expect(plainBreakdownAfter.computedTransportMinor).toBe(newBaseCostMinor);
      expect(plainBreakdownAfter.computedBaseCostMinor).toBe(newBaseCostMinor);
      const plainPkgAfter = await withOrg(orgId, (tx) => tx.tourPackage.findUniqueOrThrow({ where: { id: plainPackageId } }));
      expect(plainPkgAfter.priceMinor).toBe(expectedPriceMinor(newBaseCostMinor, 0, TAX_RATE_BP, platformFeeRateBp, 1));
      expect(plainPkgAfter.priceMinor).not.toBe(oldPlainPriceMinor);

      // Overridden package: buckets refresh, but the override price is the
      // final word -- TourPackage.priceMinor never moves.
      const overriddenBreakdownAfter = await withOrg(orgId, (tx) => tx.packageCostBreakdown.findUniqueOrThrow({ where: { tourPackageId: overriddenPackageId } }));
      expect(overriddenBreakdownAfter.computedTransportMinor).toBe(newBaseCostMinor);
      expect(overriddenBreakdownAfter.overridePriceMinor).toBe(overridePriceMinor);
      const overriddenPkgAfter = await withOrg(orgId, (tx) => tx.tourPackage.findUniqueOrThrow({ where: { id: overriddenPackageId } }));
      expect(overriddenPkgAfter.priceMinor).toBe(overridePriceMinor);

      // Booking (still open): recomputed.
      const bookingBreakdownAfter = await withOrg(orgId, (tx) => tx.bookingCostBreakdown.findUniqueOrThrow({ where: { bookingId } }));
      expect(bookingBreakdownAfter.computedBaseCostMinor).toBe(newBaseCostMinor);

      // Booking (since cancelled): skipped -- untouched.
      const cancelledBookingBreakdownAfter = await withOrg(orgId, (tx) => tx.bookingCostBreakdown.findUniqueOrThrow({ where: { bookingId: cancelledBookingId } }));
      expect(cancelledBookingBreakdownAfter.computedBaseCostMinor).toBe(oldBaseCostMinor);

      const auditEntry = await withOrg(orgId, (tx) =>
        tx.auditLog.findFirst({ where: { action: 'finance.rates_reapplied' }, orderBy: { createdAt: 'desc' } }),
      );
      expect(auditEntry).not.toBeNull();
    },
    180_000,
  );
});

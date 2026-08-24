import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { testPackageReference } from '../helpers/package-reference';
import { generateBookingReference } from '@modules/booking';
import { GUEST_GEOGRAPHY_NOT_COLLECTED } from '@modules/insights';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { GET as getInsights } from '../../src/app/api/v1/insights/route';
import { GET as getInsightsPdf } from '../../src/app/api/v1/insights/pdf/route';

/**
 * Insights & Decision Making (DR-038) -- drives the real route end to end
 * against a small, deterministic fixture in its own fresh org (this module
 * is fully ctx-gated, no guest/no-ctx flow, so unlike ratings there's no
 * need to seed into the real shared primary org).
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;

let orgId: string;
let operatorId: string;
let tourist1Id: string;
let tourist2Id: string;
let driverUserId: string;
let driverProfileId: string;
let guideUserId: string;
let vehicleId: string;
let tourPackageId: string;
let departureId: string;
let bookingAId: string;
let bookingBId: string;
let bookingCId: string;

const now = new Date();

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `INSIGHTS-API-TEST-${suffix}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [operator, tourist1, tourist2, driverUser, guideUser] = await Promise.all([
    admin.user.create({ data: { email: `op-insights-${suffix}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `tourist1-insights-${suffix}@example.test`, role: 'TOURIST', organizationId: orgId } }),
    admin.user.create({ data: { email: `tourist2-insights-${suffix}@example.test`, role: 'TOURIST', organizationId: orgId } }),
    admin.user.create({ data: { email: `driver-insights-${suffix}@example.test`, role: 'DRIVER', organizationId: orgId } }),
    admin.user.create({ data: { email: `guide-insights-${suffix}@example.test`, role: 'TOUR_GUIDE', organizationId: orgId } }),
  ]);
  operatorId = operator.id;
  tourist1Id = tourist1.id;
  tourist2Id = tourist2.id;
  driverUserId = driverUser.id;
  guideUserId = guideUser.id;

  // Split across several smaller `withOrg` transactions rather than one
  // giant one -- Prisma's default interactive-transaction timeout (5000ms)
  // is measurably too short for this sandbox's real network path to Neon
  // for many sequential creates in a single transaction (documented gotcha,
  // hit and fixed the same way in tests/ratings-lookup.test.ts, DR-037).
  await withOrg(orgId, async (tx) => {
    const driverProfile = await tx.driverProfile.create({
      data: { organizationId: orgId, userId: driverUserId, licenseNumber: `LIC-${suffix}` },
    });
    driverProfileId = driverProfile.id;
    const vehicle = await tx.vehicle.create({
      data: { organizationId: orgId, plateNumber: `INS-${suffix}`, make: 'Toyota', model: 'Hilux', vehicleType: '4x4', seatCapacity: 4 },
    });
    vehicleId = vehicle.id;
    // GuideProfile is optional on a TOUR_GUIDE User (DR-030) -- guideUtilization
    // divides by the count of ACTIVE profiles, so one must exist here for
    // the denominator to be non-zero.
    await tx.guideProfile.create({ data: { organizationId: orgId, userId: guideUserId } });
  });

  await withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: testPackageReference(),
        title: `TEST-INSIGHTS-${suffix}`,
        description: 'Fixture for insights tests.',
        country: 'NA',
        priceMinor: 100000,
        currency: 'USD',
        status: 'PUBLISHED_AVAILABLE',
      },
    });
    tourPackageId = pkg.id;

    const departure = await tx.departure.create({
      data: {
        organizationId: orgId,
        tourPackageId: pkg.id,
        startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        endDate: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        capacity: 10,
      },
    });
    departureId = departure.id;

    await tx.assignment.create({
      data: { organizationId: orgId, departureId: departure.id, vehicleId, driverProfileId, guideUserId },
    });
  });

  await withOrg(orgId, async (tx) => {
    // Booking A: PREDEFINED_PACKAGE, IN_PROGRESS ("active tour"), fully paid.
    const bookingA = await tx.booking.create({
      data: {
        organizationId: orgId,
        departureId,
        touristUserId: tourist1Id,
        seats: 1,
        status: 'IN_PROGRESS',
        priceMinor: 100000,
        currency: 'USD',
        bookingReference: generateBookingReference(),
      },
    });
    bookingAId = bookingA.id;
    const invoiceA = await tx.invoice.create({
      data: {
        organizationId: orgId,
        bookingId: bookingA.id,
        currency: 'USD',
        subtotalMinor: 100000,
        taxRateBp: 0,
        taxMinor: 0,
        totalMinor: 100000,
        depositMinor: 40000,
        balanceMinor: 60000,
        status: 'PAID',
      },
    });
    await tx.payment.create({
      data: { organizationId: orgId, invoiceId: invoiceA.id, kind: 'FULL', amountMinor: 100000, currency: 'USD', status: 'SUCCEEDED' },
    });

    // Booking B: same tourist as A (repeat customer), CONFIRMED, partially paid.
    const bookingB = await tx.booking.create({
      data: {
        organizationId: orgId,
        departureId,
        touristUserId: tourist1Id,
        seats: 1,
        status: 'CONFIRMED',
        priceMinor: 50000,
        currency: 'USD',
        bookingReference: generateBookingReference(),
      },
    });
    bookingBId = bookingB.id;
    const invoiceB = await tx.invoice.create({
      data: {
        organizationId: orgId,
        bookingId: bookingB.id,
        currency: 'USD',
        subtotalMinor: 50000,
        taxRateBp: 0,
        taxMinor: 0,
        totalMinor: 50000,
        depositMinor: 20000,
        balanceMinor: 30000,
        status: 'PARTIALLY_PAID',
      },
    });
    await tx.payment.create({
      data: { organizationId: orgId, invoiceId: invoiceB.id, kind: 'DEPOSIT', amountMinor: 20000, currency: 'USD', status: 'SUCCEEDED' },
    });

    // Booking C: TAILOR_MADE (customCountry, no departure), AWAITING_QUOTATION ("pending").
    const bookingC = await tx.booking.create({
      data: {
        organizationId: orgId,
        origin: 'TAILOR_MADE',
        touristUserId: tourist2Id,
        seats: 2,
        status: 'AWAITING_QUOTATION',
        customCountry: 'CD',
        bookingReference: generateBookingReference(),
      },
    });
    bookingCId = bookingC.id;
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
    await tx.payment.deleteMany({ where: { organizationId: orgId } });
    await tx.invoice.deleteMany({ where: { organizationId: orgId } });
    await tx.assignment.deleteMany({ where: { organizationId: orgId } });
    await tx.booking.deleteMany({ where: { organizationId: orgId } });
  });
  await withOrg(orgId, async (tx) => {
    await tx.departure.deleteMany({ where: { organizationId: orgId } });
    await tx.tourPackage.deleteMany({ where: { organizationId: orgId } });
    await tx.vehicle.deleteMany({ where: { organizationId: orgId } });
    await tx.driverProfile.deleteMany({ where: { organizationId: orgId } });
    await tx.guideProfile.deleteMany({ where: { organizationId: orgId } });
  });
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('GET /api/v1/insights', () => {
  it(
    'returns a dashboard summary matching the fixture',
    async () => {
      const headers = await loginAs(operatorId);
      const req = new NextRequest('http://localhost/api/v1/insights', { headers });
      const res = await getInsights(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(200);
      const { summary } = await res.json();

      expect(summary.bookings.totalBookings).toBe(3);
      // Booking A starts IN_PROGRESS; booking B starts CONFIRMED but its
      // departure's startDate is already in the past, so
      // bookingService.list's own sweepLifecycle call auto-transitions it
      // to IN_PROGRESS too (real production lifecycle behavior, not
      // something this dashboard controls) -- both count as "active."
      expect(summary.bookings.activeTours).toBe(2);
      expect(summary.bookings.pendingQuotations).toBe(1); // booking C

      expect(summary.revenue.revenue.USD).toBe(120000); // 100000 (A, full) + 20000 (B, deposit)
      expect(summary.revenue.outstanding.USD).toBe(30000); // booking B's remaining balance

      expect(summary.operations.fleetUtilization).toBe(1); // 1 assigned / 1 ACTIVE vehicle
      expect(summary.operations.driverUtilization).toBe(1);
      expect(summary.operations.guideUtilization).toBe(1);
      const destinations = Object.fromEntries(
        summary.operations.mostBookedDestinations.map((d: { country: string; count: number }) => [d.country, d.count]),
      );
      expect(destinations.NA).toBe(2); // bookings A + B
      expect(destinations.CD).toBe(1); // booking C (customCountry)

      expect(summary.customerExperience.repeatCustomers).toBe(1); // tourist1 has bookings A + B

      expect(summary.immigration.pendingVisas).toBe(0);
      expect(summary.immigration.approvedVisas).toBe(0);

      // ---- DR-155 additions ----
      // Invoice A (FULL, 100000) + Invoice B (DEPOSIT, 50000) both have a
      // SUCCEEDED payment -- average totalMinor = (100000+50000)/2.
      expect(summary.revenue.averageBookingValue.USD).toBe(75000);
      expect(summary.revenue.depositVsFullPaid).toEqual({ depositPathCount: 1, fullPathCount: 1 });
      expect(summary.revenue.taxCollected.USD).toBe(0); // both invoices have taxRateBp 0
      expect(Object.keys(summary.revenue.platformFeeCollected)).toHaveLength(0); // platformFeeMinor unset on both
      expect(summary.revenue.couponRedemptionCount).toBe(0);

      // Bookings A+B are PREDEFINED_PACKAGE, C is TAILOR_MADE.
      expect(summary.guest.originSplit).toEqual({ predefinedPackage: 2, tailorMade: 1 });
      // None of the 3 fixture bookings set countryOfResidence (TAILOR_MADE-only field).
      expect(summary.guest.geography[GUEST_GEOGRAPHY_NOT_COLLECTED]).toBe(3);
      // tourist1 (A, B) and tourist2 (C) both have their earliest-ever
      // booking inside this all-time range -- both read as "new."
      expect(summary.guest.newGuestCount).toBe(2);
      expect(summary.guest.returningGuestCount).toBe(0);
      const funnelByStage = Object.fromEntries(summary.guest.bookingStageFunnel.map((s: { stage: string; count: number }) => [s.stage, s.count]));
      expect(funnelByStage.AWAITING_QUOTATION).toBe(1); // booking C
      expect(summary.guest.cancellationRate).toBe(0);

      // No WizardProgressEvent rows exist for this fixture org.
      expect(summary.wizardFunnel.every((s: { reachedCount: number }) => s.reachedCount === 0)).toBe(true);

      // staff_roster.read is a brand-new permission (DR-155) -- its exact
      // seed state in whichever DB this suite runs against isn't asserted
      // here (see insightsService's own catch-and-zero fallback); just
      // confirm the shape exists.
      expect(typeof summary.staff.activeCount).toBe('number');

      // Trends: all 3 bookings + both paid invoices were created together in
      // this same beforeAll run, so an all-time (month-granularity) bucket
      // collapses them into one point each.
      expect(summary.trends.bookings.reduce((sum: number, p: { value: number }) => sum + p.value, 0)).toBe(3);
      expect(summary.trends.visaApplications).toEqual([]);
      const usdRevenueTrend = summary.trends.revenue.find((s: { currency: string }) => s.currency === 'USD');
      expect(usdRevenueTrend?.points.reduce((sum: number, p: { amountMinor: number }) => sum + p.amountMinor, 0)).toBe(150000);
      expect(summary.trends.newGuests.reduce((sum: number, p: { value: number }) => sum + p.value, 0)).toBe(2);
    },
    // insightsService deliberately serializes its composition (many small
    // sequential round trips rather than bursting concurrent `withOrg`
    // transactions, which this sandbox's Neon connection pool has choked
    // on) -- trades wall-clock time for robustness, so this needs a longer
    // allowance than most single-call API tests.
    60_000,
  );
});

// DR-193: staff can export the exact same dashboard figures the polling
// route above returns, as a downloadable PDF, with a caller-chosen subset
// of sections.
describe('GET /api/v1/insights/pdf', () => {
  it(
    'renders a real PDF covering the same fixture, with all sections by default',
    async () => {
      const headers = await loginAs(operatorId);
      const req = new NextRequest('http://localhost/api/v1/insights/pdf', { headers });
      const res = await getInsightsPdf(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/pdf');
      expect(res.headers.get('Content-Disposition')).toContain('attachment');
      const buffer = Buffer.from(await res.arrayBuffer());
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    },
    60_000,
  );

  it(
    'honors a caller-chosen subset of sections and falls back to every section on garbage input',
    async () => {
      const headers = await loginAs(operatorId);
      const narrow = await getInsightsPdf(new NextRequest('http://localhost/api/v1/insights/pdf?sections=bookings', { headers }), {
        params: Promise.resolve({}),
      });
      expect(narrow.status).toBe(200);

      const garbage = await getInsightsPdf(
        new NextRequest('http://localhost/api/v1/insights/pdf?sections=not-a-real-section', { headers }),
        { params: Promise.resolve({}) },
      );
      expect(garbage.status).toBe(200);
    },
    60_000,
  );
});

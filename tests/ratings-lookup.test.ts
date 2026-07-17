import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { formatPackageReference } from '@modules/catalog';
import { generateConfirmationCode } from '@modules/booking';
import { ratingsService } from '@modules/ratings';
import { prisma, withOrg } from '../src/lib/db';
import { ApiError } from '../src/lib/errors';

/**
 * Customer Ratings & Feedback (DR-037) -- full-flow, direct-service-call
 * tests mirroring booking-lookup.test.ts's DR-016 precedent: no ctx/session,
 * bookingReference + Rating Code instead of confirmationCode + last name.
 * Seeds into the real seeded primary org (Lam), same rationale as
 * booking-lookup.test.ts -- ratingsService.lookupForRating/submitRating
 * always resolve getPrimaryOrgId() internally, not a caller-supplied org.
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;

let orgId: string;
let touristId: string;
let driverUserId: string;
let driverProfileId: string;
let guideUserId: string;
let guideProfileId: string;
let vehicleId: string;
let tourPackageId: string;
let departureId: string;
let bookingId: string;
let bookingReference: string;
let ratingCode: string;

// 5 days ago -- comfortably past the 48h eligibility window.
const TOUR_END = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

beforeAll(async () => {
  const primary = await admin.organization.findFirstOrThrow({ where: { isPrimary: true } });
  orgId = primary.id;

  const [tourist, driverUser, guideUser] = await Promise.all([
    admin.user.create({ data: { email: `rating-tourist-${suffix}@example.test`, role: 'TOURIST', organizationId: orgId } }),
    admin.user.create({ data: { email: `rating-driver-${suffix}@example.test`, role: 'DRIVER', organizationId: orgId } }),
    admin.user.create({ data: { email: `rating-guide-${suffix}@example.test`, role: 'TOUR_GUIDE', organizationId: orgId } }),
  ]);
  touristId = tourist.id;
  driverUserId = driverUser.id;
  guideUserId = guideUser.id;

  // Split across several smaller `withOrg` transactions rather than one
  // giant one -- Prisma's default interactive-transaction timeout (5000ms)
  // is measurably too short for this sandbox's real network path to Neon
  // for this many sequential creates in a single transaction (documented
  // gotcha; prisma/seed.ts hit the exact same wall and was fixed the same
  // way).
  await withOrg(orgId, async (tx) => {
    const driverProfile = await tx.driverProfile.create({
      data: { organizationId: orgId, userId: driverUserId, licenseNumber: `LIC-${suffix}` },
    });
    driverProfileId = driverProfile.id;

    const guideProfile = await tx.guideProfile.create({ data: { organizationId: orgId, userId: guideUserId } });
    guideProfileId = guideProfile.id;

    const vehicle = await tx.vehicle.create({
      data: { organizationId: orgId, plateNumber: `RATE-${suffix}`, make: 'Toyota', model: 'Hilux', vehicleType: '4x4', seatCapacity: 4 },
    });
    vehicleId = vehicle.id;
  });

  await withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: formatPackageReference(Date.now()),
        title: `TEST-RATING-${suffix}`,
        description: 'Fixture for ratings tests.',
        country: 'NA',
        priceMinor: 100000,
        currency: 'USD',
        status: 'PUBLISHED',
      },
    });
    tourPackageId = pkg.id;

    const departure = await tx.departure.create({
      data: {
        organizationId: orgId,
        tourPackageId: pkg.id,
        startDate: new Date(TOUR_END.getTime() - 3 * 24 * 60 * 60 * 1000),
        endDate: TOUR_END,
        capacity: 4,
      },
    });
    departureId = departure.id;

    await tx.assignment.create({
      data: { organizationId: orgId, departureId: departure.id, vehicleId, driverProfileId, guideUserId },
    });
  });

  await withOrg(orgId, async (tx) => {
    bookingReference = generateConfirmationCode();
    const booking = await tx.booking.create({
      data: {
        organizationId: orgId,
        departureId,
        touristUserId: touristId,
        seats: 1,
        status: 'COMPLETED',
        priceMinor: 100000,
        currency: 'USD',
        confirmationCode: generateConfirmationCode(),
        bookingReference,
      },
    });
    bookingId = booking.id;

    await tx.invoice.create({
      data: {
        organizationId: orgId,
        bookingId: booking.id,
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

    const rc = await tx.ratingCode.create({
      data: {
        organizationId: orgId,
        bookingId: booking.id,
        issuedByUserId: touristId,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        code: `RATE${suffix}`,
      },
    });
    ratingCode = rc.code;
  });
}, 40_000);

afterAll(async () => {
  // Guard: if beforeAll failed partway through, Prisma silently drops an
  // undefined where-clause value, turning cleanup into an unscoped
  // deleteMany that wipes the whole table -- this has hit real production
  // data twice already. Skip cleanup entirely rather than risk it.
  if (
    !orgId ||
    !bookingId ||
    !departureId ||
    !tourPackageId ||
    !touristId ||
    !driverUserId ||
    !driverProfileId ||
    !guideUserId ||
    !guideProfileId ||
    !vehicleId
  ) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }

  // Split across several smaller `withOrg` transactions, same reason as
  // beforeAll above. Review/RatingCode/Invoice/Assignment all cascade-delete
  // from Booking's own FKs, but delete explicitly and in dependency order
  // rather than rely on it -- matches this codebase's existing
  // fixture-cleanup style.
  await withOrg(orgId, async (tx) => {
    await tx.review.deleteMany({ where: { bookingId } });
    await tx.ratingCode.deleteMany({ where: { bookingId } });
    await tx.invoice.deleteMany({ where: { bookingId } });
    await tx.assignment.deleteMany({ where: { departureId } });
    await tx.booking.deleteMany({ where: { id: bookingId } });
  });
  await withOrg(orgId, async (tx) => {
    await tx.departure.deleteMany({ where: { id: departureId } });
    await tx.tourPackage.deleteMany({ where: { id: tourPackageId } });
    await tx.vehicle.deleteMany({ where: { id: vehicleId } });
    await tx.driverProfile.deleteMany({ where: { id: driverProfileId } });
    await tx.guideProfile.deleteMany({ where: { id: guideProfileId } });
  });
  await withOrg(orgId, async (tx) => {
    // Organization has no owning module (DR-037) -- ratingsRepository writes
    // its averageRating/ratingCount directly, so this fixture's Review would
    // otherwise leave the real shared primary org's stat permanently stale
    // after cleanup. Recompute from whatever Review rows genuinely remain.
    const agg = await tx.review.aggregate({ _avg: { overallRating: true }, _count: true });
    await tx.organization.update({
      where: { id: orgId },
      data: { averageRating: agg._avg.overallRating, ratingCount: agg._count },
    });
  });
  await admin.user.deleteMany({ where: { id: { in: [touristId, driverUserId, guideUserId] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
}, 40_000);

describe('ratingsService.lookupForRating / submitRating', () => {
  it('resolves the ratable driver/guide on a correct bookingReference + Rating Code', async () => {
    const result = await ratingsService.lookupForRating({ bookingReference, ratingCode }, '203.0.114.10');
    expect(result.bookingReference).toBe(bookingReference);
    expect(result.drivers).toHaveLength(1);
    expect(result.drivers[0]?.driverProfileId).toBe(driverProfileId);
    expect(result.guides).toHaveLength(1);
    expect(result.guides[0]?.guideUserId).toBe(guideUserId);
  });

  it('rejects a correct bookingReference with the wrong code (no leak of which part was wrong)', async () => {
    await expect(
      ratingsService.lookupForRating({ bookingReference, ratingCode: 'WRONGCODE' }, '203.0.114.11'),
    ).rejects.toThrow();
  });

  it('rejects a made-up bookingReference', async () => {
    await expect(
      ratingsService.lookupForRating({ bookingReference: 'POL-2020-999999', ratingCode }, '203.0.114.12'),
    ).rejects.toThrow();
  });

  it(
    'submits a rating, marks the code used, and recomputes driver/guide/org aggregates',
    async () => {
      await ratingsService.submitRating(
        {
          bookingReference,
          ratingCode,
          overallRating: 5,
          overallComment: 'Wonderful trip',
          driverRatings: [{ driverProfileId, rating: 4, comment: 'Safe driver' }],
          guideRatings: [{ guideUserId, rating: 5 }],
        },
        '203.0.114.13',
      );

      const [driverProfile, guideProfile, organization] = await withOrg(orgId, async (tx) => [
        await tx.driverProfile.findUniqueOrThrow({ where: { id: driverProfileId } }),
        await tx.guideProfile.findUniqueOrThrow({ where: { id: guideProfileId } }),
        await tx.organization.findUniqueOrThrow({ where: { id: orgId } }),
      ]);

      expect(driverProfile.averageRating).toBe(4);
      expect(driverProfile.ratingCount).toBe(1);
      expect(guideProfile.averageRating).toBe(5);
      expect(guideProfile.ratingCount).toBe(1);
      expect(organization.ratingCount).toBeGreaterThanOrEqual(1);
      expect(organization.averageRating).not.toBeNull();
    },
    // submitRating does one write transaction plus up to 3 more sequential
    // recompute-then-write round trips (driver/guide/org aggregates) -- this
    // sandbox's real Neon latency (documented gotcha) makes the default 20s
    // too tight.
    60_000,
  );

  it('rejects a second lookup/submission with the now-used code (single-use enforcement)', async () => {
    await expect(ratingsService.lookupForRating({ bookingReference, ratingCode }, '203.0.114.14')).rejects.toThrow();
    await expect(
      ratingsService.submitRating(
        { bookingReference, ratingCode, overallRating: 3, driverRatings: [], guideRatings: [] },
        '203.0.114.14',
      ),
    ).rejects.toThrow();
  });

  it(
    'rate-limits repeated failures from the same IP',
    async () => {
      const ip = '203.0.114.99';
      for (let i = 0; i < 10; i++) {
        await expect(
          ratingsService.lookupForRating({ bookingReference, ratingCode: 'WRONGCODE' }, ip),
        ).rejects.toThrow();
      }
      const err = await ratingsService.lookupForRating({ bookingReference, ratingCode: 'WRONGCODE' }, ip).catch((e) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(429);
    },
    // 11 sequential lookups, each a few round trips -- this sandbox's Neon
    // latency (documented gotcha) can exceed even booking-lookup.test.ts's
    // own 40s allowance for the same shape of test.
    60_000,
  );
});

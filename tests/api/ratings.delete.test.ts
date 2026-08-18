import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { generateBookingReference } from '@modules/booking';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { DELETE as deleteReview } from '../../src/app/api/v1/ratings/[reviewId]/route';

/**
 * DR-148: SUPERADMIN-only genuine delete of an individual review. Covers
 * the role gate (a plain TOUR_OPERATOR, who holds rating.read/rating.issue
 * but never rating.delete, must be denied), cross-tenant anti-BOLA (404 not
 * 403, same convention as ratings.security.test.ts), and the real delete +
 * cascade + aggregate-recompute path.
 */
const admin = new PrismaClient();

let orgAId: string;
let orgBId: string;
let operatorAId: string; // TOUR_OPERATOR, org A -- has rating.read/issue but not rating.delete
let superAdminId: string; // SUPERADMIN, org A
let touristAId: string;
let bookingAId: string;
let ratingCodeAId: string;
let reviewAId: string;
let driverProfileAId: string;

function deleteRequest(reviewId: string, headers: Headers): NextRequest {
  return new NextRequest(`http://localhost/api/v1/ratings/${reviewId}`, { method: 'DELETE', headers });
}

async function createReviewFixture(organizationId: string, bookingId: string, driverProfileId: string) {
  return withOrg(organizationId, async (tx) => {
    const ratingCode = await tx.ratingCode.create({
      data: {
        organizationId,
        bookingId,
        issuedByUserId: touristAId,
        code: `TESTCODE${Date.now()}`,
        expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        usedAt: new Date(),
      },
    });
    const review = await tx.review.create({
      data: {
        organizationId,
        bookingId,
        ratingCodeId: ratingCode.id,
        touristUserId: touristAId,
        overallRating: 5,
        overallComment: 'Great trip',
        subjectRatings: {
          create: [{ organizationId, subjectType: 'DRIVER', driverProfileId, rating: 4, comment: 'Good driving' }],
        },
      },
    });
    return { ratingCodeId: ratingCode.id, reviewId: review.id };
  });
}

beforeAll(async () => {
  const [orgA, orgB] = await Promise.all([
    admin.organization.create({ data: { name: `RATINGS-DEL-A-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' } }),
    admin.organization.create({ data: { name: `RATINGS-DEL-B-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' } }),
  ]);
  orgAId = orgA.id;
  orgBId = orgB.id;

  const [operatorA, superAdmin, touristA] = await Promise.all([
    admin.user.create({ data: { email: `op-a-ratings-del-${Date.now()}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgAId } }),
    admin.user.create({ data: { email: `sa-ratings-del-${Date.now()}@example.test`, role: 'SUPERADMIN', organizationId: orgAId } }),
    admin.user.create({ data: { email: `tourist-a-ratings-del-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgAId } }),
  ]);
  operatorAId = operatorA.id;
  superAdminId = superAdmin.id;
  touristAId = touristA.id;

  await withOrg(orgAId, async (tx) => {
    const booking = await tx.booking.create({
      data: {
        organizationId: orgAId,
        touristUserId: touristAId,
        seats: 1,
        status: 'COMPLETED',
        priceMinor: 50000,
        currency: 'USD',
        bookingReference: generateBookingReference(),
      },
    });
    bookingAId = booking.id;

    const driverProfile = await tx.driverProfile.create({
      data: { organizationId: orgAId, userId: touristAId, licenseNumber: `TEST-${Date.now()}` },
    });
    driverProfileAId = driverProfile.id;
  });

  const { ratingCodeId, reviewId } = await createReviewFixture(orgAId, bookingAId, driverProfileAId);
  ratingCodeAId = ratingCodeId;
  reviewAId = reviewId;
});

afterAll(async () => {
  // Guard: if beforeAll failed before either org id was assigned, Prisma
  // silently drops the undefined where-clause value, turning cleanup into
  // an unscoped deleteMany that wipes the whole table -- this has hit real
  // production data twice. Skip cleanup entirely rather than risk it.
  if (!orgAId || !orgBId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await withOrg(orgAId, (tx) => tx.review.deleteMany({ where: { organizationId: orgAId } }));
  await withOrg(orgAId, (tx) => tx.ratingCode.deleteMany({ where: { organizationId: orgAId } }));
  await withOrg(orgAId, (tx) => tx.driverProfile.deleteMany({ where: { organizationId: orgAId } }));
  await withOrg(orgAId, (tx) => tx.booking.deleteMany({ where: { organizationId: orgAId } }));
  await admin.user.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
  await admin.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('DELETE /api/v1/ratings/:reviewId -- role gate', () => {
  it('TOUR_OPERATOR (rating.read/rating.issue, but not rating.delete) is forbidden (403)', async () => {
    const headers = await loginAs(operatorAId);
    const res = await deleteReview(deleteRequest(reviewAId, headers), { params: Promise.resolve({ reviewId: reviewAId }) });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/v1/ratings/:reviewId -- cross-tenant anti-BOLA', () => {
  it("a different org's SUPERADMIN-equivalent session cannot delete org A's review (404, not 403)", async () => {
    // A user with no organizationId membership at all (bare admin.user row,
    // no Membership) resolves with no org context -- requireOrg would throw
    // before ever reaching the repository, but the RLS-scoped lookup inside
    // ratingsRepository.deleteReview is the real anti-BOLA boundary being
    // exercised here: org B's own SUPERADMIN must not be able to reach org
    // A's review id at all.
    const superAdminB = await admin.user.create({
      data: { email: `sa-b-ratings-del-${Date.now()}@example.test`, role: 'SUPERADMIN', organizationId: orgBId },
    });
    const headers = await loginAs(superAdminB.id);
    const res = await deleteReview(deleteRequest(reviewAId, headers), { params: Promise.resolve({ reviewId: reviewAId }) });
    expect(res.status).toBe(404);
    await admin.user.delete({ where: { id: superAdminB.id } });
  });
});

describe('DELETE /api/v1/ratings/:reviewId -- SUPERADMIN success', () => {
  it('deletes the review, cascades its subject ratings, and recomputes the driver aggregate (204)', async () => {
    const headers = await loginAs(superAdminId);
    const res = await deleteReview(deleteRequest(reviewAId, headers), { params: Promise.resolve({ reviewId: reviewAId }) });
    expect(res.status).toBe(204);

    await withOrg(orgAId, async (tx) => {
      expect(await tx.review.findUnique({ where: { id: reviewAId } })).toBeNull();
      expect(await tx.reviewSubjectRating.findMany({ where: { reviewId: reviewAId } })).toHaveLength(0);
      // The Review's own FK cascades away from RatingCode, not the reverse
      // -- the RatingCode row itself survives, still marked used.
      const ratingCode = await tx.ratingCode.findUnique({ where: { id: ratingCodeAId } });
      expect(ratingCode?.usedAt).not.toBeNull();
      const driverProfile = await tx.driverProfile.findUnique({ where: { id: driverProfileAId } });
      expect(driverProfile?.ratingCount).toBe(0);
    });
  });

  it('404s deleting the same review again (already gone)', async () => {
    const headers = await loginAs(superAdminId);
    const res = await deleteReview(deleteRequest(reviewAId, headers), { params: Promise.resolve({ reviewId: reviewAId }) });
    expect(res.status).toBe(404);
  });
});

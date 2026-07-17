import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { generateConfirmationCode } from '@modules/booking';
import { withOrg, prisma } from '../src/lib/db';

/** Extends the RLS proof to the `review_subject_ratings` table added in DR-037. */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;
let touristAId: string;
let touristBId: string;
let guideAId: string;

async function seedOrgWithSubjectRating(
  name: string,
  guideUserId: string,
): Promise<{ orgId: string; touristId: string }> {
  const org = await admin.organization.create({ data: { name, countries: ['NA'], status: 'VERIFIED' } });
  const tourist = await admin.user.create({
    data: { email: `rls-subjrating-${name}@example.test`, role: 'TOURIST', organizationId: org.id },
  });
  await withOrg(org.id, async (tx) => {
    const booking = await tx.booking.create({
      data: {
        organizationId: org.id,
        touristUserId: tourist.id,
        seats: 1,
        confirmationCode: generateConfirmationCode(),
        bookingReference: generateConfirmationCode(),
      },
    });
    const ratingCode = await tx.ratingCode.create({
      data: {
        organizationId: org.id,
        bookingId: booking.id,
        issuedByUserId: tourist.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        code: `RLS${name}`,
        usedAt: new Date(),
      },
    });
    const review = await tx.review.create({
      data: {
        organizationId: org.id,
        bookingId: booking.id,
        ratingCodeId: ratingCode.id,
        touristUserId: tourist.id,
        overallRating: 5,
      },
    });
    await tx.reviewSubjectRating.create({
      data: { organizationId: org.id, reviewId: review.id, subjectType: 'GUIDE', guideUserId, rating: 5 },
    });
  });
  return { orgId: org.id, touristId: tourist.id };
}

beforeAll(async () => {
  // A single guide user is fine here -- RLS scoping is by the row's own
  // organizationId column, not by any relation to this user.
  const guide = await admin.user.create({ data: { email: `rls-guide-${Date.now()}@example.test`, role: 'TOUR_GUIDE' } });
  guideAId = guide.id;

  const [a, b] = await Promise.all([
    seedOrgWithSubjectRating(`RLS-SR-A-${Date.now()}`, guideAId),
    seedOrgWithSubjectRating(`RLS-SR-B-${Date.now()}`, guideAId),
  ]);
  orgA = a.orgId;
  orgB = b.orgId;
  touristAId = a.touristId;
  touristBId = b.touristId;
});

afterAll(async () => {
  // Guard: if beforeAll failed before orgA/orgB were assigned, Prisma
  // silently drops the undefined where-clause value, turning cleanup into
  // an unscoped deleteMany that wipes the whole table -- this has hit real
  // production data twice. Skip cleanup entirely rather than risk it.
  if (!orgA || !orgB) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  for (const id of [orgA, orgB]) {
    await withOrg(id, (tx) => tx.reviewSubjectRating.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.review.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.ratingCode.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.booking.deleteMany({ where: { organizationId: id } }));
  }
  await admin.user.deleteMany({ where: { id: { in: [touristAId, touristBId, guideAId] } } });
  await admin.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('Row-Level Security: review_subject_ratings tenant isolation', () => {
  it('org A sees only its own subject ratings', async () => {
    const rows = await withOrg(orgA, (tx) => tx.reviewSubjectRating.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A subject ratings', async () => {
    const rows = await withOrg(orgB, (tx) => tx.reviewSubjectRating.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.reviewSubjectRating.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write a subject rating into another tenant (WITH CHECK)', async () => {
    const reviewInOrgA = await withOrg(orgA, (tx) => tx.review.findFirstOrThrow());
    await expect(
      withOrg(orgA, (tx) =>
        tx.reviewSubjectRating.create({
          data: {
            organizationId: orgB,
            reviewId: reviewInOrgA.id,
            subjectType: 'GUIDE',
            guideUserId: guideAId,
            rating: 1,
          },
        }),
      ),
    ).rejects.toThrow();
  });
});

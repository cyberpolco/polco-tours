// ratings module — repository. The only place that touches
// prisma.ratingCode/review/reviewSubjectRating (and, for the org-wide
// aggregate, prisma.organization) for this module.
import type { RatingCode, RatingSubjectType, Review, ReviewSubjectRating } from '@prisma/client';
import { withOrg } from '@lib/db';
import { generateRatingCode } from './domain';
import type { ReviewSubjectRatingView, ReviewView, RatingCodeView } from './domain';

function toRatingCodeView(rc: RatingCode): RatingCodeView {
  return {
    id: rc.id,
    organizationId: rc.organizationId,
    bookingId: rc.bookingId,
    code: rc.code,
    issuedByUserId: rc.issuedByUserId,
    issuedAt: rc.issuedAt,
    expiresAt: rc.expiresAt,
    usedAt: rc.usedAt,
  };
}

function toReviewSubjectRatingView(r: ReviewSubjectRating): ReviewSubjectRatingView {
  return {
    id: r.id,
    subjectType: r.subjectType,
    driverProfileId: r.driverProfileId,
    guideUserId: r.guideUserId,
    rating: r.rating,
    comment: r.comment,
  };
}

function toReviewView(r: Review & { subjectRatings: ReviewSubjectRating[] }): ReviewView {
  return {
    id: r.id,
    organizationId: r.organizationId,
    bookingId: r.bookingId,
    ratingCodeId: r.ratingCodeId,
    touristUserId: r.touristUserId,
    overallRating: r.overallRating,
    overallComment: r.overallComment,
    createdAt: r.createdAt,
    subjectRatings: r.subjectRatings.map(toReviewSubjectRatingView),
  };
}

export interface SubmitRatingParams {
  bookingId: string;
  ratingCodeId: string;
  touristUserId: string;
  overallRating: number;
  overallComment?: string;
  driverRatings: Array<{ driverProfileId: string; rating: number; comment?: string }>;
  guideRatings: Array<{ guideUserId: string; rating: number; comment?: string }>;
}

export interface RatingAggregate {
  averageRating: number;
  ratingCount: number;
}

export const ratingsRepository = {
  async createRatingCode(
    organizationId: string,
    params: { bookingId: string; issuedByUserId: string; expiresAt: Date },
  ): Promise<RatingCodeView> {
    return withOrg(organizationId, async (tx) => {
      const rc = await tx.ratingCode.create({
        data: {
          organizationId,
          bookingId: params.bookingId,
          issuedByUserId: params.issuedByUserId,
          expiresAt: params.expiresAt,
          code: generateRatingCode(),
        },
      });
      return toRatingCodeView(rc);
    });
  },

  async findRatingCodeByBookingId(organizationId: string, bookingId: string): Promise<RatingCodeView | null> {
    return withOrg(organizationId, async (tx) => {
      const rc = await tx.ratingCode.findUnique({ where: { bookingId } });
      return rc ? toRatingCodeView(rc) : null;
    });
  },

  async findRatingCodeByCode(organizationId: string, code: string): Promise<RatingCodeView | null> {
    return withOrg(organizationId, async (tx) => {
      const rc = await tx.ratingCode.findUnique({ where: { code } });
      return rc ? toRatingCodeView(rc) : null;
    });
  },

  /** One transaction: insert the Review + its ReviewSubjectRating rows, and
   * mark the RatingCode used -- atomic within this module's own tables. */
  async createReviewAndMarkUsed(organizationId: string, params: SubmitRatingParams): Promise<ReviewView> {
    return withOrg(organizationId, async (tx) => {
      const review = await tx.review.create({
        data: {
          organizationId,
          bookingId: params.bookingId,
          ratingCodeId: params.ratingCodeId,
          touristUserId: params.touristUserId,
          overallRating: params.overallRating,
          overallComment: params.overallComment,
          subjectRatings: {
            create: [
              ...params.driverRatings.map((d) => ({
                organizationId,
                subjectType: 'DRIVER' as RatingSubjectType,
                driverProfileId: d.driverProfileId,
                rating: d.rating,
                comment: d.comment,
              })),
              ...params.guideRatings.map((g) => ({
                organizationId,
                subjectType: 'GUIDE' as RatingSubjectType,
                guideUserId: g.guideUserId,
                rating: g.rating,
                comment: g.comment,
              })),
            ],
          },
        },
        include: { subjectRatings: true },
      });
      await tx.ratingCode.update({ where: { id: params.ratingCodeId }, data: { usedAt: new Date() } });
      return toReviewView(review);
    });
  },

  async listReviews(organizationId: string): Promise<ReviewView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.review.findMany({ include: { subjectRatings: true }, orderBy: { createdAt: 'desc' } });
      return rows.map(toReviewView);
    });
  },

  async recomputeDriverAggregate(organizationId: string, driverProfileId: string): Promise<RatingAggregate> {
    return withOrg(organizationId, async (tx) => {
      const agg = await tx.reviewSubjectRating.aggregate({
        where: { subjectType: 'DRIVER', driverProfileId },
        _avg: { rating: true },
        _count: true,
      });
      return { averageRating: agg._avg.rating ?? 0, ratingCount: agg._count };
    });
  },

  async recomputeGuideAggregate(organizationId: string, guideUserId: string): Promise<RatingAggregate> {
    return withOrg(organizationId, async (tx) => {
      const agg = await tx.reviewSubjectRating.aggregate({
        where: { subjectType: 'GUIDE', guideUserId },
        _avg: { rating: true },
        _count: true,
      });
      return { averageRating: agg._avg.rating ?? 0, ratingCount: agg._count };
    });
  },

  /** Organization has no owning module (same "shared, no owning module"
   * precedent as TaxRate pre-DR-034) -- writes it directly here rather than
   * through a cross-module call, since there is no service to call through. */
  async recomputeOrganizationAggregate(organizationId: string): Promise<RatingAggregate> {
    return withOrg(organizationId, async (tx) => {
      const agg = await tx.review.aggregate({ _avg: { overallRating: true }, _count: true });
      const aggregate: RatingAggregate = { averageRating: agg._avg.overallRating ?? 0, ratingCount: agg._count };
      await tx.organization.update({ where: { id: organizationId }, data: aggregate });
      return aggregate;
    });
  },

  async getOrganizationRatingSummary(organizationId: string): Promise<RatingAggregate> {
    return withOrg(organizationId, async (tx) => {
      const org = await tx.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { averageRating: true, ratingCount: true },
      });
      return { averageRating: org.averageRating ?? 0, ratingCount: org.ratingCount };
    });
  },
};

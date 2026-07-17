// ratings module — service. Business logic; orchestrates repository + rbac +
// cross-module composition. Callable by other modules ONLY through index.ts
// (module boundary rule).
import type { AuthContext } from '@modules/auth';
import { authService } from '@modules/auth';
import { assignmentService } from '@modules/assignment';
import { bookingService } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { fleetService } from '@modules/fleet';
import { invoicingService } from '@modules/invoicing';
import { notificationsService } from '@modules/notifications';
import { audit, countRecentAuditEvents } from '@lib/audit';
import { Errors } from '@lib/errors';
import { getPrimaryOrgId } from '@lib/primary-org';
import { assertCan } from '@lib/rbac';
import {
  canIssueRatingCode,
  canSubmitRating,
  isRatingCodeUsable,
  ratingCodeExpiryFrom,
  type RatableDriver,
  type RatableGuide,
  type RatingCodeLookupInput,
  type RatingCodeView,
  type RatingLookupResult,
  type ReviewView,
  type SubmitRatingInput,
} from './domain';
import { ratingsRepository } from './repository';

function requireOrg(ctx: AuthContext): string {
  if (!ctx.organizationId) throw Errors.forbidden('No organization membership');
  return ctx.organizationId;
}

// Same threshold/window as booking's own guest-lookup rate limit
// (lookupByConfirmationCode) -- no real rate-limiting infra exists yet
// (crude audit-log-backed counter, DR-016).
const LOOKUP_RATE_LIMIT_WINDOW_MINUTES = 15;
const LOOKUP_RATE_LIMIT_MAX_ATTEMPTS = 10;

/** Shared by lookupForRating and submitRating -- both independently
 * re-derive full eligibility end-to-end (defense in depth against a time
 * gap between a guest viewing the form and submitting it). Throws a single
 * generic 404/409 on any failure, same anti-enumeration posture as
 * bookingService.lookupByConfirmationCode -- never reveal which check
 * failed. */
async function resolveEligibleBooking(
  organizationId: string,
  input: RatingCodeLookupInput,
  ip: string | undefined,
) {
  if (ip) {
    const recentFailures = await countRecentAuditEvents({
      organizationId,
      action: 'rating.lookup_failed',
      ip,
      sinceMinutes: LOOKUP_RATE_LIMIT_WINDOW_MINUTES,
    });
    if (recentFailures >= LOOKUP_RATE_LIMIT_MAX_ATTEMPTS) {
      throw Errors.rateLimited('Too many attempts -- try again later');
    }
  }

  const booking = await bookingService.getBookingForRating(organizationId, input.bookingReference);
  const ratingCode = await ratingsRepository.findRatingCodeByCode(organizationId, input.ratingCode);
  const now = new Date();

  if (!booking || !ratingCode || ratingCode.bookingId !== booking.id || !isRatingCodeUsable(ratingCode, now)) {
    await audit({ action: 'rating.lookup_failed', resourceType: 'RatingCode', organizationId, ip });
    throw Errors.notFound('No matching booking found');
  }

  const invoiceStatus = await invoicingService.getInvoiceStatusForBooking(organizationId, booking.id);
  const tourEndDate = booking.departureId
    ? ((await catalogService.getDepartureWindow(booking.departureId))?.endDate ?? null)
    : booking.customTravelEnd;

  if (!canSubmitRating({ bookingStatus: booking.status, invoiceStatus, tourEndDate, now })) {
    // Distinct from the anti-enumeration 404 above: the guest DOES possess a
    // valid, matching, unused code at this point, so telling them it's too
    // early / not yet fully paid isn't an enumeration risk.
    throw Errors.conflict('Not yet eligible to rate this booking');
  }

  return { booking, ratingCode };
}

/** Resolves the departure's real Assignment rows into a display-ready
 * driver/guide list -- empty for a TAILOR_MADE booking with no departure
 * yet. authService.getUser is the same raw, no-ctx "caller already gates"
 * lookup assignment/service.ts already uses to resolve a guide's identity. */
async function resolveRatableStaff(
  organizationId: string,
  departureId: string | null,
): Promise<{ drivers: RatableDriver[]; guides: RatableGuide[] }> {
  if (!departureId) return { drivers: [], guides: [] };

  const assignments = await assignmentService.listAssignmentsForRating(organizationId, departureId);
  const driverProfileIds = [...new Set(assignments.map((a) => a.driverProfileId))];
  const guideUserIds = [...new Set(assignments.map((a) => a.guideUserId).filter((id): id is string => id !== null))];

  const [driverProfiles, guideUsers] = await Promise.all([
    fleetService.listDriverProfilesForRating(organizationId, driverProfileIds),
    Promise.all(guideUserIds.map((id) => authService.getUser(id))),
  ]);

  const drivers: RatableDriver[] = await Promise.all(
    driverProfiles.map(async (dp) => {
      const user = await authService.getUser(dp.userId);
      return { driverProfileId: dp.id, name: user?.name ?? user?.email ?? 'Driver' };
    }),
  );
  const guides: RatableGuide[] = guideUsers
    .filter((u): u is NonNullable<typeof u> => u !== null)
    .map((u) => ({ guideUserId: u.id, name: u.name ?? u.email }));

  return { drivers, guides };
}

export const ratingsService = {
  /** Staff-only: generates the single-use Rating Code once a booking's
   * invoice is PAID. One per booking -- no re-issue path (not specified). */
  async issueRatingCode(ctx: AuthContext, bookingId: string): Promise<RatingCodeView> {
    assertCan(ctx, 'rating.issue');
    const organizationId = requireOrg(ctx);

    const booking = await bookingService.getById(ctx, bookingId); // 404s if not found/not in org
    const invoice = await invoicingService.getOrCreateInvoiceForBooking(ctx, bookingId);
    const existing = await ratingsRepository.findRatingCodeByBookingId(organizationId, bookingId);

    if (!canIssueRatingCode({ invoiceStatus: invoice.status, alreadyIssued: !!existing })) {
      throw Errors.conflict(
        existing ? 'A Rating Code has already been issued for this booking' : 'This booking is not yet fully paid',
      );
    }

    const ratingCode = await ratingsRepository.createRatingCode(organizationId, {
      bookingId,
      issuedByUserId: ctx.userId,
      expiresAt: ratingCodeExpiryFrom(new Date()),
    });

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'rating.code_issued',
      resourceType: 'RatingCode',
      resourceId: ratingCode.id,
      organizationId,
    });
    await notificationsService.notify('RATING_CODE_ISSUED', booking.touristUserId, organizationId, {
      bookingId: booking.id,
      ratingCode: ratingCode.code,
    });

    return ratingCode;
  },

  /** Booking-detail page's data source for the "Rating Code" panel -- same
   * permission as issuing one, since only an actor who could issue a code
   * needs to see its current status/expiry. Plainly displayed (not
   * reveal-once) -- it's not a login credential. */
  async getRatingCodeForBooking(ctx: AuthContext, bookingId: string): Promise<RatingCodeView | null> {
    assertCan(ctx, 'rating.issue');
    return ratingsRepository.findRatingCodeByBookingId(requireOrg(ctx), bookingId);
  },

  async listReviews(ctx: AuthContext): Promise<ReviewView[]> {
    assertCan(ctx, 'rating.read');
    return ratingsRepository.listReviews(requireOrg(ctx));
  },

  /** Staff moderation/insights source: agency-wide + per-driver/per-guide
   * averages, composed from fleet's existing manager-only listings (which
   * already carry averageRating/ratingCount once fleet's schema fields
   * exist) plus the org-level aggregate this module writes. */
  async getAggregateSummary(ctx: AuthContext) {
    assertCan(ctx, 'rating.read');
    const organizationId = requireOrg(ctx);
    const [organization, drivers, guides] = await Promise.all([
      ratingsRepository.getOrganizationRatingSummary(organizationId),
      fleetService.listDriverProfiles(ctx),
      fleetService.listGuideProfiles(ctx),
    ]);
    return { organization, drivers, guides };
  },

  /** Public, no-ctx -- mirrors bookingService.lookupByConfirmationCode. */
  async lookupForRating(input: RatingCodeLookupInput, ip: string | undefined): Promise<RatingLookupResult> {
    const organizationId = await getPrimaryOrgId();
    const { booking } = await resolveEligibleBooking(organizationId, input, ip);
    const { drivers, guides } = await resolveRatableStaff(organizationId, booking.departureId);
    return { bookingReference: booking.bookingReference, drivers, guides };
  },

  /** Public, no-ctx. Re-validates everything lookupForRating did (the guest
   * may have taken time between viewing and submitting), then re-validates
   * every submitted driverProfileId/guideUserId against the departure's
   * real Assignment rows -- never trust client-submitted ids -- before
   * writing anything. Aggregate recompute is sequential and best-effort
   * (same precedent as invoicingService's own sequential cross-module
   * awaits): a failed downstream write just leaves that one aggregate stale
   * until the next submission recomputes it fresh, never silently wrong
   * forever. */
  async submitRating(input: RatingCodeLookupInput & SubmitRatingInput, ip: string | undefined): Promise<void> {
    const organizationId = await getPrimaryOrgId();
    const { booking, ratingCode } = await resolveEligibleBooking(organizationId, input, ip);
    const { drivers, guides } = await resolveRatableStaff(organizationId, booking.departureId);

    const validDriverIds = new Set(drivers.map((d) => d.driverProfileId));
    const validGuideIds = new Set(guides.map((g) => g.guideUserId));
    const driverRatings = input.driverRatings.filter((r) => validDriverIds.has(r.driverProfileId));
    const guideRatings = input.guideRatings.filter((r) => validGuideIds.has(r.guideUserId));

    const review = await ratingsRepository.createReviewAndMarkUsed(organizationId, {
      bookingId: booking.id,
      ratingCodeId: ratingCode.id,
      touristUserId: booking.touristUserId,
      overallRating: input.overallRating,
      overallComment: input.overallComment,
      driverRatings,
      guideRatings,
    });

    for (const d of new Set(driverRatings.map((r) => r.driverProfileId))) {
      const aggregate = await ratingsRepository.recomputeDriverAggregate(organizationId, d);
      await fleetService.recordDriverRatingAggregate(organizationId, d, aggregate);
    }
    for (const g of new Set(guideRatings.map((r) => r.guideUserId))) {
      const aggregate = await ratingsRepository.recomputeGuideAggregate(organizationId, g);
      await fleetService.recordGuideRatingAggregateByUserId(organizationId, g, aggregate);
    }
    await ratingsRepository.recomputeOrganizationAggregate(organizationId);

    await audit({
      action: 'rating.submitted',
      resourceType: 'Review',
      resourceId: review.id,
      organizationId,
      ip,
    });
  },
};

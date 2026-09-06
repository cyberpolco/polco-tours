// ratings module — domain types & rules. Pure; no framework or DB imports.
// Customer Ratings & Feedback (DR-037) -- closes the gap DR-029/030
// deliberately left open ("no rating field -- deferred until a real reviews
// system exists").
import type { BookingStatus, InvoiceStatus, Role } from '@prisma/client';
import { z } from 'zod';

export interface RatingCodeView {
  id: string;
  organizationId: string;
  bookingId: string;
  code: string;
  // Null for a system-issued code (DR-261's automatic sweep) -- see the
  // schema.prisma comment on RatingCode.issuedByUserId.
  issuedByUserId: string | null;
  issuedAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
}

export interface ReviewSubjectRatingView {
  id: string;
  subjectType: 'DRIVER' | 'GUIDE';
  driverProfileId: string | null;
  guideUserId: string | null;
  rating: number;
  comment: string | null;
}

export interface ReviewView {
  id: string;
  organizationId: string;
  bookingId: string;
  ratingCodeId: string;
  touristUserId: string;
  overallRating: number;
  overallComment: string | null;
  createdAt: Date;
  subjectRatings: ReviewSubjectRatingView[];
}

// Explicit user direction: the code is usable starting the day after the
// tour's last day, and stays valid for exactly 5 days after that last day
// -- both ends of the window are anchored to the tour's own end date
// (Departure.endDate / Booking.customTravelEnd), not to whenever staff
// happened to issue the code. Anchoring expiry to issuance (the original
// DR-037 design) had a real gap: a booking can be fully paid -- and the
// code issued -- well before or after the tour actually happens, so an
// issuance-anchored window had no guaranteed relationship to the tour's
// last day at all.
export const RATING_CODE_VALIDITY_DAYS_AFTER_TOUR_END = 5;
export const RATING_ELIGIBILITY_DELAY_HOURS = 24;

/** DR-148: genuinely destructive (Review has no soft-delete column, and
 * deleting one is meant to actually remove it, not archive it) --
 * SUPERADMIN-only, same "route passes via the DB-editable permission
 * matrix, service still rejects" layering as isBookingDeleter/
 * isFleetDeleter/isCountryRegulationWriter. */
export function isRatingDeleter(roles: Role[]): boolean {
  return roles.includes('SUPERADMIN');
}

// Same shape as booking's generateBookingReference (excludes 0/O/1/I --
// unambiguous when read aloud or handwritten) -- duplicated rather than
// imported since it's a private, unexported detail of booking/domain.ts and
// this module's `code` column is an independent DB-unique value.
const RATING_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RATING_CODE_LENGTH = 8;

export function generateRatingCode(): string {
  const bytes = new Uint8Array(RATING_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => RATING_CODE_ALPHABET[b % RATING_CODE_ALPHABET.length]).join('');
}

/** Anchored to the tour's own last day, not to issuance time -- see the
 * comment on RATING_CODE_VALIDITY_DAYS_AFTER_TOUR_END above. */
export function ratingCodeExpiryFromTourEnd(tourEndDate: Date): Date {
  return new Date(tourEndDate.getTime() + RATING_CODE_VALIDITY_DAYS_AFTER_TOUR_END * 24 * 60 * 60 * 1000);
}

/** Derived, not stored -- same "lazy expiry" precedent as booking's
 * isHoldExpired. Single-use: usedAt is set the moment a Review is created
 * for it and never cleared. */
export function isRatingCodeUsable(rc: Pick<RatingCodeView, 'usedAt' | 'expiresAt'>, now: Date): boolean {
  return rc.usedAt === null && rc.expiresAt > now;
}

/** Staff-side precondition for generating a code -- full payment only
 * (spec: "issued... once the booking is fully paid"), deliberately checked
 * via the invoice, not Booking.status -- a booking can reach CONFIRMED/
 * COMPLETED off a deposit-only payment (DR-027's lifecycle), so
 * Booking.status alone can't tell you "paid in full." */
export function canIssueRatingCode(params: { invoiceStatus: InvoiceStatus | null; alreadyIssued: boolean }): boolean {
  return params.invoiceStatus === 'PAID' && !params.alreadyIssued;
}

/** Automatic-issuance precondition (DR-261, explicit user request: fire the
 * night before a tour ends, regardless of payment status) -- deliberately
 * does NOT check invoice status, unlike canIssueRatingCode above, which
 * stays exactly as-is for the manual staff-issued path. Still excludes a
 * cancelled/refunded booking (its tour isn't actually happening) and one
 * that already has a code. */
export function canAutoIssueRatingCode(params: { bookingStatus: BookingStatus; alreadyIssued: boolean }): boolean {
  if (params.alreadyIssued) return false;
  return params.bookingStatus !== 'CANCELLED' && params.bookingStatus !== 'REFUNDED';
}

/** DR-261: every operating country (Namibia, the DRC region operated in
 * (Lubumbashi), Zambia, Zimbabwe, Botswana) currently sits at a fixed UTC+2
 * offset with no DST -- so "21:00 local" reduces to a single fixed UTC cron
 * time (19:00 UTC, see scripts/register-qstash-schedule.ts) rather than a
 * real per-country timezone lookup. Revisit this if a future operating
 * country outside that offset is added. Returns the [start, end) UTC range
 * for "tomorrow" relative to `now` -- a range match, not exact-equality,
 * since Departure.endDate/Booking.customTravelEnd aren't guaranteed to be
 * normalized to UTC midnight (computeDepartureEndDate only shifts the
 * calendar day, not the time-of-day it inherits from Departure.startDate). */
export function tomorrowUtcDayRange(now: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2));
  return { start, end };
}

/** Guest-side precondition for submitting a rating -- the spec's "Rating
 * Eligibility" list minus the RatingCode-specific checks (usability is
 * checked separately via isRatingCodeUsable, since it needs the RatingCode
 * row itself, not just the booking). tourEndDate is guaranteed non-null
 * whenever bookingStatus is COMPLETED, since bookingRepository's own
 * IN_PROGRESS -> COMPLETED sweep requires a non-null endDate/
 * customTravelEnd -- the null check below is defensive, not expected to
 * ever actually trigger. */
export function canSubmitRating(params: {
  bookingStatus: BookingStatus;
  invoiceStatus: InvoiceStatus | null;
  tourEndDate: Date | null;
  now: Date;
}): boolean {
  if (params.bookingStatus !== 'COMPLETED') return false;
  if (params.invoiceStatus !== 'PAID') return false;
  if (!params.tourEndDate) return false;
  // "Usable starting the day after the tour ends" -- RATING_ELIGIBILITY_DELAY_HOURS is 24h.
  const eligibleFrom = new Date(params.tourEndDate.getTime() + RATING_ELIGIBILITY_DELAY_HOURS * 60 * 60 * 1000);
  return params.now >= eligibleFrom;
}

export const RatingCodeLookupInput = z.object({
  bookingReference: z.string().min(1).max(30),
  ratingCode: z.string().min(1).max(20),
});
export type RatingCodeLookupInput = z.infer<typeof RatingCodeLookupInput>;

const SubjectRatingInput = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

// driverRatings/guideRatings default to [] -- a TAILOR_MADE booking with no
// departure yet (or one with no guide assigned) has nothing to rate
// individually, so the form must work with zero subject ratings; only the
// overall/agency score is mandatory.
export const SubmitRatingInput = z.object({
  overallRating: z.number().int().min(1).max(5),
  overallComment: z.string().max(1000).optional(),
  driverRatings: z.array(SubjectRatingInput.extend({ driverProfileId: z.string().uuid() })).optional().default([]),
  guideRatings: z.array(SubjectRatingInput.extend({ guideUserId: z.string().uuid() })).optional().default([]),
});
export type SubmitRatingInput = z.infer<typeof SubmitRatingInput>;

export interface RatableDriver {
  driverProfileId: string;
  name: string;
}

export interface RatableGuide {
  guideUserId: string;
  name: string;
}

/** What the guest-facing /rate/result page needs to render the form --
 * deliberately minimal (not the full BookingView) since this is shown to an
 * unauthenticated caller. */
export interface RatingLookupResult {
  bookingReference: string;
  drivers: RatableDriver[];
  guides: RatableGuide[];
}

/** DR-068: the org-wide rating aggregate, surfaced publicly (no ctx) for the
 * guest homepage trust bar -- genuinely public marketing data (an average
 * star rating + review count), same "no ctx needed for public data"
 * convention as catalogService.listPublicPackages. Structurally identical
 * to repository.ts's internal RatingAggregate, kept as a separate exported
 * type since that one is a repository-internal computation shape, not a
 * public view contract. */
export interface OrganizationRatingSummary {
  averageRating: number;
  ratingCount: number;
}

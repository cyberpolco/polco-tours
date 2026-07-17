// ratings module — domain types & rules. Pure; no framework or DB imports.
// Customer Ratings & Feedback (DR-037) -- closes the gap DR-029/030
// deliberately left open ("no rating field -- deferred until a real reviews
// system exists").
import type { BookingStatus, InvoiceStatus } from '@prisma/client';
import { z } from 'zod';

export interface RatingCodeView {
  id: string;
  organizationId: string;
  bookingId: string;
  code: string;
  issuedByUserId: string;
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

// Spec: "expires after a configurable period (recommended: 30 days)" -- a
// plain constant is this codebase's existing precedent for "configurable
// but nobody has asked to actually change it yet" (e.g. booking's
// HOLD_DURATION_MINUTES, the visa module's resubmission window).
export const RATING_CODE_VALIDITY_DAYS = 30;
export const RATING_ELIGIBILITY_DELAY_HOURS = 48;

// Same shape as booking's generateConfirmationCode (excludes 0/O/1/I --
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

export function ratingCodeExpiryFrom(now: Date): Date {
  return new Date(now.getTime() + RATING_CODE_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
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

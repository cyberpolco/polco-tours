// booking module — domain types & rules. Pure; no framework or DB imports.
// One deliberate exception (DR-046): PACKAGE_TAGS is imported from
// @modules/catalog's public index.ts (not reaching into catalog/domain.ts
// directly) to validate Booking.preferredTags against the same tag
// vocabulary TourPackage.tags uses, rather than hand-duplicating that
// 7-value tuple in a second module where it could silently drift.
import type { AddonCode, BookingOrigin, BookingStatus, CancellationRefundTier, Currency, FlightClass, PackageTag, Role, Sex } from '@prisma/client';
import { z } from 'zod';
import { PACKAGE_TAGS } from '@modules/catalog';

export const HOLD_DURATION_MINUTES = 30;

// DR-058: a soft-deleted booking (Booking.deletedAt) is permanently purged
// this many days later, via the same lazy sweepLifecycle convention
// repository.ts already uses for hold-expiry/status transitions -- no
// scheduled job exists in this codebase, deliberately.
export const BOOKING_DELETION_RETENTION_DAYS = 90;

/** Genuinely destructive (unlike every other booking mutation, this has no
 * status-transition table entry and no way back) -- SUPERADMIN-only, same
 * "route passes via the DB-editable permission matrix, service still
 * rejects" layering as isCountryRegulationWriter/isFinanceConfigWriter. */
export function isBookingDeleter(roles: Role[]): boolean {
  return roles.includes('SUPERADMIN');
}

/** DR-159: the "Confirm" action itself is narrower than the `booking.confirm`
 * permission it's still gated behind -- that permission also covers
 * Refund/Send Quotation/Convert-to-Itinerary/link Customized Package/the
 * TAILOR_MADE cost-breakdown editor, all of which PLATFORM_ADMIN keeps, so
 * it can't itself be narrowed to exclude PLATFORM_ADMIN from just Confirm.
 * Same "route/service passes the broader permission, this hardcoded check
 * is the real gate" layering as isBookingDeleter. */
export function isBookingConfirmer(roles: Role[]): boolean {
  return roles.includes('SUPERADMIN') || roles.includes('TOUR_OPERATOR');
}

/** DR-219: a booking's trip date (Departure.startDate for
 * PREDEFINED_PACKAGE, Booking.customTravelStart for a not-yet-converted
 * TAILOR_MADE request) was previously not editable at all after creation --
 * explicit user request to make it editable, but only for SUPERADMIN/
 * TOUR_OPERATOR, at any status short of the terminal ones isBookingLocked
 * already blocks. Same shape as isBookingConfirmer (identical two roles
 * today), kept as its own named function since it gates a different action
 * with its own rationale, not a reuse of the confirm gate. */
export function isDepartureDateChanger(roles: Role[]): boolean {
  return roles.includes('SUPERADMIN') || roles.includes('TOUR_OPERATOR');
}

// DR-060: a whole-org candidate list for the visa module's "needs
// application" reconciliation view -- travelers with an uploaded passport on
// a booking that requires one, regardless of whether a VisaApplication has
// been created for them yet (that check lives in the visa module, which owns
// that table; booking only knows about its own Traveler/Booking data).
export interface VisaCandidateTravelerView {
  travelerId: string;
  bookingId: string;
  origin: BookingOrigin;
  firstName: string;
  lastName: string;
  // Nullable since DR-111 -- a TAILOR_MADE traveler may never have had these
  // collected. visaService guards against submitting an application for one.
  nationality: string | null;
  idOrPassportNumber: string | null;
}

// Mirrors the Prisma AddonCode enum -- defined locally rather than imported
// (unlike PACKAGE_TAGS) since catalog/domain.ts doesn't itself export a
// zod-validating constant for AddonCode yet (AddonService.code is only ever
// staff-authored, never guest-submitted, so it never needed one before).
const ADDON_CODES = ['PHOTOGRAPHY', 'VIDEOGRAPHY', 'TRANSLATOR', 'VISA_ASSISTANCE'] as const;

export interface BookingView {
  id: string;
  organizationId: string;
  origin: BookingOrigin;
  departureId: string | null;
  touristUserId: string;
  seats: number;
  status: BookingStatus;
  holdExpiresAt: Date | null;
  priceMinor: number | null;
  currency: Currency | null;
  // DR-134: whole-booking (already x seats) snapshot of the package's own
  // tax+fee-composition fields, copied at hold-creation time -- null
  // whenever the departure used a manual priceOverrideMinor, for a
  // TAILOR_MADE booking, or for a booking that predates DR-134.
  // invoicingService trusts these instead of resolving tax/platform fee
  // live when set.
  priceSubtotalMinor: number | null;
  priceTaxRateBp: number | null;
  pricePlatformFeeRateBp: number | null;
  // DR-198: snapshotted LateBookingRate.surchargeRateBp at hold-creation
  // (PREDEFINED_PACKAGE) or tailor-made-request (TAILOR_MADE) time -- see
  // this column's own schema.prisma comment. Null = unaffected.
  lateBookingSurchargeBp: number | null;
  addonsFinalizedAt: Date | null;
  // Snapshotted when add-ons are finalized (setAddons) -- true only if the
  // selection included Visa Assistance. Drives whether the Passport wizard
  // step appears at all, and for how many travelers (see
  // isTravelerManifestComplete).
  requiresPassportUpload: boolean;
  bookingReference: string;
  specialRequests: string | null;
  customCountry: string | null;
  customTravelStart: Date | null;
  customTravelEnd: Date | null;
  customDescription: string | null;
  // Guest preference context for staff pricing a TAILOR_MADE request
  // (DR-046) -- empty arrays for a PREDEFINED_PACKAGE booking, same as
  // customCountry etc. being null for one.
  preferredTags: PackageTag[];
  preferredSites: string[];
  // DR-047: the full set of countries the guest ticked on /plan-my-trip --
  // customCountry above is just the first pick (still the sole driver of
  // tax/visa lookups). contactEmail is booking-scoped, not User.email.
  preferredCountries: string[];
  contactEmail: string | null;
  // DR-057: the guest's own name at inquiry time -- see the schema
  // comment on Booking.contactLastName for why this exists (find-booking's
  // last-name check has no Traveler/tour-lead row to fall back on before a
  // TAILOR_MADE booking's quotation is accepted).
  contactFirstName: string | null;
  contactLastName: string | null;
  // DR-048: guest-expressed add-on interest (staff context, no priced
  // AddonService/BookingAddon row -- there's no package to attach one to
  // yet) + the guest's own residence/citizenship (relevant to the
  // visa-assistance interest above; distinct from Traveler.nationality,
  // which is collected per-traveler later, once a manifest exists).
  preferredAddons: AddonCode[];
  countryOfResidence: string | null;
  citizenship: string | null;
  // DR-108: the DRAFT TourPackage staff created from this TAILOR_MADE
  // request's plan-my-trip answers, if any -- set once, never reassigned.
  customizedPackageId: string | null;
  // DR-207: guest self-service cancellation via /find-booking -- all three
  // null unless bookingService.cancelForBookingLookup set them. See this
  // module's own schema.prisma comment on Booking.cancellationRefundTier.
  cancellationReason: string | null;
  cancellationContactEmail: string | null;
  cancellationRefundTier: CancellationRefundTier | null;
  createdAt: Date;
  updatedAt: Date;
}

export const CreateBookingInput = z.object({
  departureId: z.string().uuid(),
  seats: z.number().int().positive(),
  // Only honored for an actor with booking.create granted on someone else's
  // behalf (TOUR_OPERATOR); a tourist's own touristUserId always wins.
  touristUserId: z.string().uuid().optional(),
  specialRequests: z.string().max(1000).optional(),
});
export type CreateBookingInput = z.infer<typeof CreateBookingInput>;

// DR-054 (revised same session): a guest booking a real, PUBLISHED
// TourPackage now picks only their own travel start date instead of joining
// a staff-pre-scheduled Departure -- trip length is staff-set
// (TourPackage.durationDays, set when the package is created/edited), never
// a per-booking guest choice, so there's no endDate here at all; capacity/
// pricing/scheduling revolve around exactly this booking's start date, much
// closer to how a TAILOR_MADE request already works (see CreateTailorMadeInput
// below), except this one DOES have a real packageId from the start (a
// Departure gets created for it, see catalogService.createDepartureForBooking,
// rather than staying package-less like a bespoke departure).
export const CreateBookingWithDatesInput = z.object({
  packageId: z.string().uuid(),
  startDate: z.coerce.date(),
  seats: z.number().int().positive(),
  touristUserId: z.string().uuid().optional(),
  specialRequests: z.string().max(1000).optional(),
});
export type CreateBookingWithDatesInput = z.infer<typeof CreateBookingWithDatesInput>;

// A bespoke trip request with no pre-existing Departure -- staff price it
// manually afterward via sendQuotation. `countries` is ISO-3166 alpha-2
// (same convention as Traveler.nationality), one or more, in the guest's
// selection order -- countries[0] is the sole driver of tax-rate/visa-
// country lookups (DR-047, unchanged from the original single-country
// customCountry design), while the full array is kept as
// Booking.preferredCountries for staff context, same tier as
// preferredTags/preferredSites (the merged "plan my trip" form's
// carried-over quiz preference questions, DR-046) -- never a matching/
// scoring input. `email` is booking-scoped contact info (Booking
// .contactEmail), not a User.email change -- see that field's own comment
// for why.
export const CreateTailorMadeInput = z
  .object({
    countries: z.array(z.string().length(2)).min(1),
    customTravelStart: z.coerce.date(),
    customTravelEnd: z.coerce.date(),
    seats: z.number().int().positive(),
    // Optional (DR-048, explicit user direction) -- staff already see
    // country/dates/tags/sites/add-ons context; a free-text description is
    // a nice-to-have, not required to submit an inquiry.
    customDescription: z.string().max(2000).optional(),
    touristUserId: z.string().uuid().optional(),
    specialRequests: z.string().max(1000).optional(),
    preferredTags: z.array(z.enum(PACKAGE_TAGS)).optional(),
    preferredSites: z.array(z.string()).optional(),
    email: z.string().email(),
    // DR-057: required, not optional -- without a name captured here,
    // /find-booking's last-name check has nothing to match against until
    // the booking has a real Traveler manifest (post-quotation-acceptance).
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    preferredAddons: z.array(z.enum(ADDON_CODES)).optional(),
    countryOfResidence: z.string().length(2),
    citizenship: z.string().length(2),
  })
  // BUDGET and LUXURY are contradictory trip preferences -- the guest/staff
  // forms already prevent selecting both client-side, this is the backend
  // source of truth (charter rule: server validates, never trusts the UI).
  .refine((v) => !(v.preferredTags?.includes('BUDGET') && v.preferredTags?.includes('LUXURY')), {
    message: 'Budget and Luxury are mutually exclusive preferences -- pick one',
    path: ['preferredTags'],
  });
export type CreateTailorMadeInput = z.infer<typeof CreateTailorMadeInput>;

// DR-128: overrideReason is optional here (structurally) -- whether it's
// actually *required* depends on whether the submitted price deviates from
// the booking's own cost breakdown, which this module can't check itself
// (finance depends on booking, so booking can't import finance without a
// cycle). That comparison + the "is a reason required" decision happens one
// level up, in sendQuotationAction, which has access to both services --
// same "cross-module orchestration lives at the caller" convention as
// itineraryService composing booking/catalog. sendQuotation itself only
// needs the reason to log a distinct, audited override action.
export const SendQuotationInput = z.object({
  priceMinor: z.number().int().positive(),
  currency: z.enum(['USD', 'EUR', 'NAD', 'CDF']),
  overrideReason: z.string().min(1).max(500).optional(),
});
export type SendQuotationInput = z.infer<typeof SendQuotationInput>;

// DR-219: the new "reschedule a trip's date" action's request body.
export const UpdateTripDatesInput = z.object({
  startDate: z.coerce.date(),
});
export type UpdateTripDatesInput = z.infer<typeof UpdateTripDatesInput>;

export function holdExpiryFrom(now: Date): Date {
  return new Date(now.getTime() + HOLD_DURATION_MINUTES * 60 * 1000);
}

// Explicit code-pattern spec (business rule, not just "random enough"):
// exactly 6 characters, uppercase A-Z + 0-9 only (36-char pool), no
// character repeated within a code, exactly 2 or 3 letters with every
// letter separated by at least one digit (no two letters adjacent). Valid
// pattern count: 10 letter-position layouts for 2 letters + 4 for 3 letters
// = 14 layouts; total valid codes = 77,688,000. Generates `bookingReference`
// -- DR-052 removed the separate `confirmationCode` secret this function
// used to also generate (two independent calls, two different codes); one
// booking now gets exactly one code. `bookingReference` doesn't come from
// `booking_reference_seq` (see repository.ts's collision-retry wrapper,
// which is what actually guarantees "never generate the same code twice":
// the DB's `@unique` constraint rejects a collision outright, and the
// repository regenerates and retries rather than erroring the request).
const CODE_LENGTH = 6;
const CODE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CODE_DIGITS = '0123456789';

/** Every way to place `count` letters among `CODE_LENGTH` positions with no
 * two adjacent -- enumerated once at module load rather than hand-listed,
 * so the adjacency invariant is provably correct instead of manually
 * re-verified. Positions are 0-indexed and returned in ascending order. */
function nonAdjacentPositionSets(totalSlots: number, count: number): number[][] {
  const results: number[][] = [];
  function extend(nextMin: number, chosen: number[]): void {
    if (chosen.length === count) {
      results.push(chosen);
      return;
    }
    for (let pos = nextMin; pos < totalSlots; pos++) {
      extend(pos + 2, [...chosen, pos]);
    }
  }
  extend(0, []);
  return results;
}

// 10 layouts for 2 letters, 4 for 3 letters -- computed once. Layouts
// within the SAME letter count are interchangeable (each has identically
// P(26, count) * P(10, 6-count) underlying (letters, digits) combinations,
// since that only depends on how many letters/digits there are, not which
// positions they sit in) -- but a 2-letter layout (P(26,2)*P(10,4) =
// 3,276,000 combinations) and a 3-letter layout (P(26,3)*P(10,3) =
// 11,232,000) are NOT interchangeable with each other, despite both being
// "one of the 14 valid layouts": a 3-letter layout represents about 3.43x
// more of the valid-code space than a 2-letter one. Picking uniformly
// across all 14 (or a flat 50/50 between letter counts) would measurably
// skew the result toward 2-letter codes -- confirmed empirically (a 50k-
// sample run came out ~72%/28% instead of the correct ~42%/58%) before
// this weighting was added. See pickLayout()'s weights below for the fix.
const LAYOUTS_2_LETTERS = nonAdjacentPositionSets(CODE_LENGTH, 2);
const LAYOUTS_3_LETTERS = nonAdjacentPositionSets(CODE_LENGTH, 3);

// Weights so the OVERALL distribution across all 77,688,000 valid codes is
// uniform: proportional to total combinations per letter-count group --
// 10 layouts * 3,276,000 : 4 layouts * 11,232,000 simplifies to 35:48 (of
// 83 total weight units).
const WEIGHT_FOR_2_LETTERS = 35;
const TOTAL_LAYOUT_WEIGHT = 83; // 35 (2 letters) + 48 (3 letters)

/** Unwraps a value only `undefined` because of `noUncheckedIndexedAccess`,
 * for an array access this file's own bounds logic already guarantees is
 * safe -- throws instead of silently proceeding with a bad code if that
 * invariant is ever violated by a future edit. */
function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(`generateBookingReference: ${message}`);
  return value;
}

/** Rejection-sampled random index in [0, maxExclusive) via the Web Crypto
 * CSPRNG -- avoids the modulo bias a plain `byte % max` would have here,
 * since neither 26 nor 10 evenly divides 256 (unlike a power-of-two
 * alphabet, where `byte % max` is unbiased). */
function randomIndex(maxExclusive: number): number {
  const usableRange = 256 - (256 % maxExclusive);
  while (true) {
    const byte = crypto.getRandomValues(new Uint8Array(1))[0];
    if (byte !== undefined && byte < usableRange) return byte % maxExclusive;
  }
}

/** Fisher-Yates shuffle using the same rejection-sampled randomness --
 * drawing the first N characters of a shuffled alphabet is equivalent to
 * sampling N distinct characters uniformly at random without replacement. */
function shuffled(alphabet: string): string[] {
  const chars = alphabet.split('');
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    const a = required(chars[i], 'shuffle index out of bounds');
    const b = required(chars[j], 'shuffle index out of bounds');
    chars[i] = b;
    chars[j] = a;
  }
  return chars;
}

/** Picks a letter-position layout with the weighting explained above --
 * uniform across all 77,688,000 valid codes, not just uniform per layout. */
function pickLayout(): number[] {
  const roll = randomIndex(TOTAL_LAYOUT_WEIGHT);
  const layouts = roll < WEIGHT_FOR_2_LETTERS ? LAYOUTS_2_LETTERS : LAYOUTS_3_LETTERS;
  return required(layouts[randomIndex(layouts.length)], 'no letter-position layout selected');
}

/** Short, human-typeable reference code following the exact character-
 * pattern spec above -- not a secret (bookingReference is shown widely
 * throughout the app); the "find my booking" lookup pairs it with the tour
 * lead's last name for a light anti-enumeration check, see
 * bookingService.lookupByBookingReference. */
export function generateBookingReference(): string {
  const layout = pickLayout();
  const letterPositions = new Set(layout);
  const letters = shuffled(CODE_LETTERS).slice(0, layout.length);
  const digits = shuffled(CODE_DIGITS).slice(0, CODE_LENGTH - layout.length);

  const code: string[] = [];
  let letterIndex = 0;
  let digitIndex = 0;
  for (let position = 0; position < CODE_LENGTH; position++) {
    code.push(
      letterPositions.has(position)
        ? required(letters[letterIndex++], 'letters exhausted')
        : required(digits[digitIndex++], 'digits exhausted'),
    );
  }
  return code.join('');
}

export function isHoldExpired(b: Pick<BookingView, 'status' | 'holdExpiresAt'>, now: Date): boolean {
  return b.status === 'AWAITING_DEPOSIT' && b.holdExpiresAt !== null && b.holdExpiresAt <= now;
}

/** Whether a booking currently occupies a seat on its departure. Only
 * meaningful for a PREDEFINED_PACKAGE booking -- a TAILOR_MADE booking has
 * no fixed departure/capacity to occupy in the first place. */
export function occupiesCapacity(b: Pick<BookingView, 'status' | 'holdExpiresAt'>, now: Date): boolean {
  switch (b.status) {
    case 'AWAITING_DEPOSIT':
      return !isHoldExpired(b, now);
    case 'DEPOSIT_PAID':
    case 'FULLY_PAID':
    case 'CONFIRMED':
    case 'IN_PROGRESS':
      return true;
    default:
      return false;
  }
}

export function computeAvailability(capacity: number, seatsTaken: number): number {
  return Math.max(0, capacity - seatsTaken);
}

// Status lifecycle (v2 -- replaces HELD/CONFIRMED/CANCELLED/EXPIRED/
// QUOTE_REQUESTED). A hold is now AWAITING_DEPOSIT + holdExpiresAt (was
// HELD); an expired hold lazily sweeps straight to CANCELLED -- there is no
// dedicated EXPIRED value in this status set, so the expired-vs-manually-
// cancelled distinction survives only in the audit log. Staff may confirm on
// deposit alone (DEPOSIT_PAID -> CONFIRMED), matching the old HELD/
// QUOTE_REQUESTED -> CONFIRMED allowance -- no automatic re-check beyond
// what already happened when the hold/quote was created.
const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  DRAFT: ['AWAITING_QUOTATION', 'AWAITING_DEPOSIT', 'CANCELLED'],
  AWAITING_QUOTATION: ['QUOTATION_SENT', 'CANCELLED'],
  QUOTATION_SENT: ['AWAITING_DEPOSIT', 'CANCELLED'],
  AWAITING_DEPOSIT: ['DEPOSIT_PAID', 'FULLY_PAID', 'CANCELLED'],
  DEPOSIT_PAID: ['FULLY_PAID', 'CONFIRMED', 'CANCELLED'],
  FULLY_PAID: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: ['REFUNDED'],
  REFUNDED: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

// DR-105: once a booking reaches one of these, it's done -- travelers/
// add-ons/passport, itinerary days/sites, cost breakdown, and coupon
// apply/remove all hard-block against it (no SUPERADMIN override).
export const TERMINAL_BOOKING_STATUSES: readonly BookingStatus[] = ['COMPLETED', 'CANCELLED', 'REFUNDED'];

export function isBookingLocked(status: BookingStatus): boolean {
  return TERMINAL_BOOKING_STATUSES.includes(status);
}

// DR-207: server-side canonical version of the CANCELLABLE_STATUSES arrays
// hand-copied across the guest/staff booking-detail pages (see CLAUDE.md's
// roadmap "deliberately deferred" note on deduplicating those) -- this is
// the one bookingService.cancelForBookingLookup gates on, since that write
// path has no page-level UI gate to lean on.
export const CANCELLABLE_BOOKING_STATUSES: readonly BookingStatus[] = [
  'AWAITING_QUOTATION',
  'QUOTATION_SENT',
  'AWAITING_DEPOSIT',
  'DEPOSIT_PAID',
  'FULLY_PAID',
  'CONFIRMED',
];

// -------------------------------------------------------------- travelers

export interface TravelerView {
  id: string;
  organizationId: string;
  bookingId: string;
  firstName: string;
  lastName: string;
  // Nullable since DR-111 -- see requiresFullTravelerDetails below.
  age: number | null;
  sex: Sex;
  nationality: string | null;
  idOrPassportNumber: string | null;
  phone: string | null;
  // Tour-lead-only contact fields -- null for every other traveler on the
  // booking (the wizard only ever asks for these on the isTourLead row).
  countryOfResidence: string | null;
  email: string | null;
  disabilities: string | null;
  allergies: string | null;
  drinkPreference: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
  isTourLead: boolean;
  passportDocumentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Data-minimized projection for a guide's own "client list" (Guides Module,
 * DR-030) -- excludes idOrPassportNumber and passportDocumentId. A guide
 * needs to know who's on their tour and how to help them, not their
 * passport number or document reference (CLAUDE.md's "Tourist physical-
 * safety data ... minimize exposure" crown-jewel framing). */
export interface TravelerDutyView {
  id: string;
  firstName: string;
  lastName: string;
  age: number | null;
  sex: Sex;
  nationality: string | null;
  phone: string | null;
  disabilities: string | null;
  allergies: string | null;
  drinkPreference: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
  isTourLead: boolean;
}

export function toTravelerDutyView(t: TravelerView): TravelerDutyView {
  return {
    id: t.id,
    firstName: t.firstName,
    lastName: t.lastName,
    age: t.age,
    sex: t.sex,
    nationality: t.nationality,
    phone: t.phone,
    disabilities: t.disabilities,
    allergies: t.allergies,
    drinkPreference: t.drinkPreference,
    emergencyContactName: t.emergencyContactName,
    emergencyContactPhone: t.emergencyContactPhone,
    emergencyContactRelation: t.emergencyContactRelation,
    isTourLead: t.isTourLead,
  };
}

/** A guide's "client list" grouped by booking (Guides Module, DR-030). */
export interface TravelerDutyGroup {
  booking: {
    id: string;
    bookingReference: string;
    specialRequests: string | null;
  };
  travelers: TravelerDutyView[];
}

// E.164: optional leading +, 1-15 digits, first digit non-zero (same shape as auth/domain.ts).
const E164 = /^\+?[1-9]\d{6,14}$/;

export const AddTravelerInput = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  // Optional here (validated for shape only when present) -- whether these
  // are actually required is a per-booking business rule, not a shape rule,
  // so it's enforced in bookingService.addTraveler via
  // requiresFullTravelerDetails, not this schema.
  age: z.number().int().min(0).max(120).optional(),
  sex: z.enum(['M', 'F', 'X']),
  nationality: z.string().length(2).optional(), // ISO-3166 alpha-2
  idOrPassportNumber: z.string().min(1).max(50).optional(),
  // Tour-lead-only in practice (the wizard only ever asks for these on the
  // isTourLead row) -- optional here rather than conditionally required,
  // since this schema validates one traveler at a time with no visibility
  // into whether it's the lead.
  phone: z.string().regex(E164).optional(),
  countryOfResidence: z.string().length(2).optional(),
  email: z.string().email().optional(),
  disabilities: z.string().max(500).optional(),
  allergies: z.string().max(500).optional(),
  drinkPreference: z.string().max(200).optional(),
  emergencyContactName: z.string().max(200).optional(),
  // Reference info for a guide/staff member to call in an emergency, not
  // used for outbound messaging (unlike the traveler's own `phone`) -- kept
  // as a plain string rather than E.164 so the form doesn't need a second
  // country-code selector for what's ultimately just a note.
  emergencyContactPhone: z.string().max(50).optional(),
  emergencyContactRelation: z.string().max(100).optional(),
  isTourLead: z.boolean().optional().default(false),
});
export type AddTravelerInput = z.infer<typeof AddTravelerInput>;

/** A Booking accepts one Traveler per seat -- no more. */
export function canAddTraveler(existingCount: number, seats: number): boolean {
  return existingCount < seats;
}

/** DR-111: a PREDEFINED_PACKAGE booking is real, immediate travel -- age,
 * nationality, and ID/passport number are required at traveler-setup time,
 * same as before. A TAILOR_MADE request's plan-my-trip wizard never collects
 * real per-traveler data for these (only the tour lead's own citizenship/
 * country of residence, and only a seat count for everyone else) -- staff
 * setting one up shouldn't have to assume/fabricate a value just to satisfy
 * the form. */
export function requiresFullTravelerDetails(origin: BookingOrigin): boolean {
  return origin !== 'TAILOR_MADE';
}

export function hasExactlyOneTourLead(travelers: Pick<TravelerView, 'isTourLead'>[]): boolean {
  return travelers.filter((t) => t.isTourLead).length === 1;
}

/** Gate for invoicing (see bookingService.getBillableTotal): the manifest is
 * only complete once every seat has a traveler and exactly one is the tour
 * lead. Passports are only required at all if `requiresPassports` is true
 * (the booking's finalized add-ons included Visa Assistance -- see
 * Booking.requiresPassportUpload) -- and when they are, EVERY traveler needs
 * one on file, not just the tour lead (a change from the original
 * tour-lead-only rule). */
export function isTravelerManifestComplete(
  travelers: Pick<TravelerView, 'isTourLead' | 'passportDocumentId'>[],
  seats: number,
  requiresPassports: boolean,
): boolean {
  if (travelers.length !== seats) return false;
  if (!hasExactlyOneTourLead(travelers)) return false;
  if (!requiresPassports) return true;
  return travelers.every((t) => t.passportDocumentId != null);
}

// -------------------------------------------------------------- add-ons

// DR-222: code/name are joined in from the addon's catalog identity
// (AddonService) at read time -- BookingAddon itself has no name column.
// flightClass/airline/originAirportCode/destinationAirportCode (FLIGHT_TICKET)
// and dataAllowanceGb (ESIM) are the guest's snapshotted variant selection --
// null for every other AddonCode.
export interface BookingAddonView {
  id: string;
  organizationId: string;
  bookingId: string;
  addonServiceId: string;
  code: AddonCode;
  name: string;
  priceMinor: number;
  currency: Currency;
  flightClass: FlightClass | null;
  airline: string | null;
  originAirportCode: string | null;
  destinationAirportCode: string | null;
  dataAllowanceGb: number | null;
  createdAt: Date;
}

// DR-222: FLIGHT_TICKET requires originAirportId/destinationAirportId/
// airline/flightClass; ESIM requires dataAllowanceGb. Every other AddonCode
// takes none of these -- bookingService.setAddons validates the right
// subset is present per the selected addon's actual code (not enforceable
// here in the pure zod shape, since that requires a DB lookup).
export const AddonSelectionInput = z.object({
  addonServiceId: z.string().uuid(),
  flightClass: z.enum(['ECONOMY', 'BUSINESS', 'FIRST']).optional(),
  airline: z.string().min(1).max(200).optional(),
  originAirportId: z.string().uuid().optional(),
  destinationAirportId: z.string().uuid().optional(),
  dataAllowanceGb: z.number().int().positive().optional(),
});
export type AddonSelectionInput = z.infer<typeof AddonSelectionInput>;

export const SetAddonsInput = z.object({
  addons: z.array(AddonSelectionInput),
});
export type SetAddonsInput = z.infer<typeof SetAddonsInput>;

// -------------------------------------------------------------- guest lookup (DR-016)

export const LookupBookingInput = z.object({
  bookingReference: z.string().min(1).max(20),
  lastName: z.string().min(1).max(100),
});
export type LookupBookingInput = z.infer<typeof LookupBookingInput>;

/** Read-only summary for the public "find my booking" flow -- deliberately
 * excludes document/passport bytes and offers no mutating action (see
 * bookingService.lookupByBookingReference). */
export interface BookingLookupResult {
  booking: BookingView;
  travelers: TravelerView[];
}

/** Case-insensitive on purpose -- a guest typing their own last name should
 * not have to match capitalization exactly. */
export function lastNameMatches(traveler: Pick<TravelerView, 'lastName'>, candidate: string): boolean {
  return traveler.lastName.trim().toLowerCase() === candidate.trim().toLowerCase();
}

/** Same case-insensitive-trim posture as lastNameMatches -- the second
 * verification factor bookingService.cancelForBookingLookup adds on top of
 * it (DR-207). Email is a real match against the tour lead's own on-file
 * address, not just accepted as typed. */
export function emailMatches(onFile: string, candidate: string): boolean {
  return onFile.trim().toLowerCase() === candidate.trim().toLowerCase();
}

// -------------------------------------------------------------- cancellation & refund (DR-207)

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Cancellation & Refund Policy (see /terms) -- pure day-diff rule against
 * the booking's known travel-start date. `referenceDate` is
 * Departure.startDate for a PREDEFINED_PACKAGE booking, or
 * Booking.customTravelStart for TAILOR_MADE; null (no date pinned yet --
 * e.g. an unquoted TAILOR_MADE inquiry) resolves to the most generous
 * tier, since there's no departure to be "close to" yet. Same MS_PER_DAY
 * day-diff convention as computeLateBookingSurchargeBp/fleet's
 * daysUntilExpiry. >=60 days out: full refund of whatever was paid, minus
 * the deposit. 30-59: half. 14-29: a quarter. Under 14: nothing. */
export function resolveCancellationRefundTier(referenceDate: Date | null, now: Date = new Date()): CancellationRefundTier {
  if (!referenceDate) return 'FULL_MINUS_DEPOSIT';
  const daysUntilTravel = (referenceDate.getTime() - now.getTime()) / MS_PER_DAY;
  if (daysUntilTravel >= 60) return 'FULL_MINUS_DEPOSIT';
  if (daysUntilTravel >= 30) return 'FIFTY_PERCENT';
  if (daysUntilTravel >= 14) return 'TWENTY_FIVE_PERCENT';
  return 'NONE';
}

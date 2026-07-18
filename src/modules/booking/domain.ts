// booking module — domain types & rules. Pure; no framework or DB imports.
// One deliberate exception (DR-046): PACKAGE_TAGS is imported from
// @modules/catalog's public index.ts (not reaching into catalog/domain.ts
// directly) to validate Booking.preferredTags against the same tag
// vocabulary TourPackage.tags uses, rather than hand-duplicating that
// 7-value tuple in a second module where it could silently drift.
import type { AddonCode, BookingOrigin, BookingStatus, Currency, PackageTag, Sex } from '@prisma/client';
import { z } from 'zod';
import { PACKAGE_TAGS } from '@modules/catalog';

export const HOLD_DURATION_MINUTES = 30;

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
  addonsFinalizedAt: Date | null;
  confirmationCode: string;
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
  // DR-048: guest-expressed add-on interest (staff context, no priced
  // AddonService/BookingAddon row -- there's no package to attach one to
  // yet) + the guest's own residence/citizenship (relevant to the
  // visa-assistance interest above; distinct from Traveler.nationality,
  // which is collected per-traveler later, once a manifest exists).
  preferredAddons: AddonCode[];
  countryOfResidence: string | null;
  citizenship: string | null;
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
export const CreateTailorMadeInput = z.object({
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
  preferredAddons: z.array(z.enum(ADDON_CODES)).optional(),
  countryOfResidence: z.string().length(2).optional(),
  citizenship: z.string().length(2).optional(),
});
export type CreateTailorMadeInput = z.infer<typeof CreateTailorMadeInput>;

export const SendQuotationInput = z.object({
  priceMinor: z.number().int().positive(),
  currency: z.enum(['USD', 'EUR', 'NAD', 'CDF']),
});
export type SendQuotationInput = z.infer<typeof SendQuotationInput>;

export function holdExpiryFrom(now: Date): Date {
  return new Date(now.getTime() + HOLD_DURATION_MINUTES * 60 * 1000);
}

// Explicit code-pattern spec (business rule, not just "random enough"):
// exactly 6 characters, uppercase A-Z + 0-9 only (36-char pool), no
// character repeated within a code, exactly 2 or 3 letters with every
// letter separated by at least one digit (no two letters adjacent). Valid
// pattern count: 10 letter-position layouts for 2 letters + 4 for 3 letters
// = 14 layouts; total valid codes = 77,688,000. Both `confirmationCode` and
// `bookingReference` are generated by this same function (two independent
// calls, two different codes) -- `bookingReference` no longer comes from
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
  if (value === undefined) throw new Error(`generateConfirmationCode: ${message}`);
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

/** Short, human-typeable lookup/reference code following the exact
 * character-pattern spec above -- not a security boundary on its own, see
 * bookingService.lookupByConfirmationCode. */
export function generateConfirmationCode(): string {
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

// -------------------------------------------------------------- travelers

export interface TravelerView {
  id: string;
  organizationId: string;
  bookingId: string;
  firstName: string;
  lastName: string;
  age: number;
  sex: Sex;
  nationality: string;
  idOrPassportNumber: string;
  phone: string | null;
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
  age: number;
  sex: Sex;
  nationality: string;
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
  age: z.number().int().min(0).max(120),
  sex: z.enum(['M', 'F', 'X']),
  nationality: z.string().length(2), // ISO-3166 alpha-2
  idOrPassportNumber: z.string().min(1).max(50),
  phone: z.string().regex(E164).optional(),
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

export function hasExactlyOneTourLead(travelers: Pick<TravelerView, 'isTourLead'>[]): boolean {
  return travelers.filter((t) => t.isTourLead).length === 1;
}

/** Gate for invoicing (see bookingService.getBillableTotal): the manifest is
 * only complete once every seat has a traveler, exactly one is the tour
 * lead, and that tour lead has a passport on file. */
export function isTravelerManifestComplete(
  travelers: Pick<TravelerView, 'isTourLead' | 'passportDocumentId'>[],
  seats: number,
): boolean {
  if (travelers.length !== seats) return false;
  if (!hasExactlyOneTourLead(travelers)) return false;
  const lead = travelers.find((t) => t.isTourLead);
  return lead?.passportDocumentId != null;
}

// -------------------------------------------------------------- add-ons

export interface BookingAddonView {
  id: string;
  organizationId: string;
  bookingId: string;
  addonServiceId: string;
  priceMinor: number;
  currency: Currency;
  createdAt: Date;
}

export const SetAddonsInput = z.object({
  addonServiceIds: z.array(z.string().uuid()),
});
export type SetAddonsInput = z.infer<typeof SetAddonsInput>;

// -------------------------------------------------------------- guest lookup (DR-016)

export const LookupBookingInput = z.object({
  confirmationCode: z.string().min(1).max(20),
  lastName: z.string().min(1).max(100),
});
export type LookupBookingInput = z.infer<typeof LookupBookingInput>;

/** Read-only summary for the public "find my booking" flow -- deliberately
 * excludes document/passport bytes and offers no mutating action (see
 * bookingService.lookupByConfirmationCode). */
export interface BookingLookupResult {
  booking: BookingView;
  travelers: TravelerView[];
}

/** Case-insensitive on purpose -- a guest typing their own last name should
 * not have to match capitalization exactly. */
export function lastNameMatches(traveler: Pick<TravelerView, 'lastName'>, candidate: string): boolean {
  return traveler.lastName.trim().toLowerCase() === candidate.trim().toLowerCase();
}

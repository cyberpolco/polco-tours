// booking module — domain types & rules. Pure; no framework or DB imports.
import type { BookingStatus, Currency, Sex } from '@prisma/client';
import { z } from 'zod';

export const HOLD_DURATION_MINUTES = 30;

export interface BookingView {
  id: string;
  organizationId: string;
  departureId: string;
  touristUserId: string;
  seats: number;
  status: BookingStatus;
  holdExpiresAt: Date | null;
  priceMinor: number;
  currency: Currency;
  addonsFinalizedAt: Date | null;
  confirmationCode: string;
  createdAt: Date;
  updatedAt: Date;
}

export const CreateBookingInput = z.object({
  departureId: z.string().uuid(),
  seats: z.number().int().positive(),
  // Only honored for an actor with booking.create granted on someone else's
  // behalf (TOUR_OPERATOR); a tourist's own touristUserId always wins.
  touristUserId: z.string().uuid().optional(),
});
export type CreateBookingInput = z.infer<typeof CreateBookingInput>;

export function holdExpiryFrom(now: Date): Date {
  return new Date(now.getTime() + HOLD_DURATION_MINUTES * 60 * 1000);
}

// Excludes 0/O/1/I -- unambiguous when read aloud or handwritten (DR-016).
const CONFIRMATION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CONFIRMATION_CODE_LENGTH = 8;

/** Short, human-typeable lookup code -- not a security boundary on its own,
 * see bookingService.lookupByConfirmationCode. */
export function generateConfirmationCode(): string {
  const bytes = new Uint8Array(CONFIRMATION_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CONFIRMATION_CODE_ALPHABET[b % CONFIRMATION_CODE_ALPHABET.length]).join('');
}

export function isHoldExpired(b: Pick<BookingView, 'status' | 'holdExpiresAt'>, now: Date): boolean {
  return b.status === 'HELD' && b.holdExpiresAt !== null && b.holdExpiresAt <= now;
}

/** Whether a booking currently occupies a seat on its departure. */
export function occupiesCapacity(b: Pick<BookingView, 'status' | 'holdExpiresAt'>, now: Date): boolean {
  if (b.status === 'CONFIRMED') return true;
  if (b.status === 'HELD') return !isHoldExpired(b, now);
  return false;
}

export function computeAvailability(capacity: number, seatsTaken: number): number {
  return Math.max(0, capacity - seatsTaken);
}

// QUOTE_REQUESTED (DR-024) is reached from HELD when a guest picks "request
// a quotation" instead of paying -- releases the seat hold (occupiesCapacity
// below already excludes it, no change needed there) but keeps the booking
// row (travelers/passport/add-ons) intact for staff follow-up. Staff may
// confirm a quote directly (accepted risk, no automatic capacity re-check --
// see the caution text on the staff booking-detail page).
const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  HELD: ['CONFIRMED', 'CANCELLED', 'EXPIRED', 'QUOTE_REQUESTED'],
  CONFIRMED: ['CANCELLED'],
  CANCELLED: [],
  EXPIRED: [],
  QUOTE_REQUESTED: ['CONFIRMED', 'CANCELLED'],
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
  isTourLead: boolean;
  passportDocumentId: string | null;
  createdAt: Date;
  updatedAt: Date;
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

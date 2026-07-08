// booking module — domain types & rules. Pure; no framework or DB imports.
import type { BookingStatus, Currency } from '@prisma/client';
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

const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  HELD: ['CONFIRMED', 'CANCELLED', 'EXPIRED'],
  CONFIRMED: ['CANCELLED'],
  CANCELLED: [],
  EXPIRED: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

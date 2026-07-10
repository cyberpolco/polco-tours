import type { BookingStatus, PaymentStatus } from '@prisma/client';
import type { BadgeTone } from '@/components/ui/Badge';

// Shared status->tone mappings -- used by both the booking-home dashboard
// and the find-booking result page, which both render a Booking's status.
export const BOOKING_STATUS_TONE: Record<BookingStatus, BadgeTone> = {
  HELD: 'warning',
  CONFIRMED: 'success',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
};

export const PAYMENT_STATUS_TONE: Record<PaymentStatus, BadgeTone> = {
  PENDING: 'warning',
  SUCCEEDED: 'success',
  FAILED: 'danger',
};

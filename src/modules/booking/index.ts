// booking module — public interface. Other modules import ONLY from here.
export { bookingService } from './service';
export type { Availability, BillableTotal } from './service';
export {
  AddTravelerInput,
  BOOKING_DELETION_RETENTION_DAYS,
  CANCELLABLE_BOOKING_STATUSES,
  CreateBookingInput,
  CreateBookingWithDatesInput,
  CreateTailorMadeInput,
  LookupBookingInput,
  SendQuotationInput,
  SetAddonsInput,
  TERMINAL_BOOKING_STATUSES,
  UpdateTripDatesInput,
  generateBookingReference,
  isBookingLocked,
  requiresFullTravelerDetails,
  resolveCancellationRefundTier,
} from './domain';
export type {
  BookingAddonView,
  BookingLookupResult,
  BookingView,
  TravelerDutyGroup,
  TravelerDutyView,
  TravelerView,
  VisaCandidateTravelerView,
} from './domain';
export type { CancellationRefundTier } from '@prisma/client';

// booking module — public interface. Other modules import ONLY from here.
export { bookingService } from './service';
export type { Availability, BillableTotal } from './service';
export {
  AddTravelerInput,
  CreateBookingInput,
  CreateTailorMadeInput,
  LookupBookingInput,
  SendQuotationInput,
  SetAddonsInput,
  generateConfirmationCode,
} from './domain';
export type { BookingAddonView, BookingLookupResult, BookingView, TravelerView } from './domain';

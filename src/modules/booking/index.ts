// booking module — public interface. Other modules import ONLY from here.
export { bookingService } from './service';
export type { Availability } from './service';
export type { BookingView, CreateBookingInput } from './domain';

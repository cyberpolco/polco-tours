// booking module — public interface. Other modules import ONLY from here.
export { bookingService } from './service';
export type { Availability } from './service';
export { CreateBookingInput } from './domain';
export type { BookingView } from './domain';

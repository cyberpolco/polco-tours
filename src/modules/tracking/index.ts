// tracking module — public interface. Other modules import ONLY from here.
export { trackingService } from './service';
export { locationFreshness, resolveTripProgress } from './domain';
export type { ActiveTripView, FleetLocationView, FleetSnapshot, LocationFreshness, TripProgress, TripStatus } from './domain';

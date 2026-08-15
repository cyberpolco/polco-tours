// itinerary module — public interface. Other modules import ONLY from here.
export { itineraryService } from './service';
export {
  AddItineraryDayInput,
  CreateActivityInput,
  CreateHotelInput,
  CreateItineraryInput,
  CreateRestaurantInput,
  CreateSiteInput,
  RateHotelInput,
  RateRestaurantInput,
  UpdateActivityInput,
  UpdateHotelInput,
  UpdateItineraryDayInput,
  UpdateItineraryInput,
  UpdateRestaurantInput,
  UpdateSiteInput,
  canTransition,
} from './domain';
export type {
  ActivityView,
  HotelRatingView,
  HotelView,
  ItineraryDaySiteView,
  ItineraryDayView,
  ItineraryView,
  MapDayView,
  MapOverviewView,
  MapStopKind,
  MapStopView,
  RestaurantRatingView,
  RestaurantView,
  SiteView,
} from './domain';
export type { ItineraryStatus } from '@prisma/client';

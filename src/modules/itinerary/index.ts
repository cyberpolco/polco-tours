// itinerary module — public interface. Other modules import ONLY from here.
export { itineraryService } from './service';
export {
  AddItineraryDayInput,
  CreateHotelInput,
  CreateItineraryInput,
  CreateRestaurantInput,
  CreateSiteInput,
  RateHotelInput,
  RateRestaurantInput,
  UpdateHotelInput,
  UpdateItineraryDayInput,
  UpdateItineraryInput,
  UpdateRestaurantInput,
  UpdateSiteInput,
  canTransition,
} from './domain';
export type {
  HotelRatingView,
  HotelView,
  ItineraryDayView,
  ItineraryView,
  RestaurantRatingView,
  RestaurantView,
  SiteView,
} from './domain';
export type { ItineraryStatus } from '@prisma/client';

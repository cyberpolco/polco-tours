// itinerary module — public interface. Other modules import ONLY from here.
export { itineraryService } from './service';
export {
  AddItineraryDayInput,
  CreateHotelInput,
  CreateItineraryInput,
  CreateRestaurantInput,
  RateHotelInput,
  RateRestaurantInput,
  UpdateHotelInput,
  UpdateItineraryDayInput,
  UpdateItineraryInput,
  UpdateRestaurantInput,
  canTransition,
} from './domain';
export type {
  HotelRatingView,
  HotelView,
  ItineraryDayView,
  ItineraryView,
  RestaurantRatingView,
  RestaurantView,
} from './domain';
export type { ItineraryStatus } from '@prisma/client';

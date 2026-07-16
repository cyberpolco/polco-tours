// itinerary module — public interface. Other modules import ONLY from here.
export { itineraryService } from './service';
export {
  AddItineraryDayInput,
  CreateHotelInput,
  CreateItineraryInput,
  CreateRestaurantInput,
  UpdateHotelInput,
  UpdateItineraryDayInput,
  UpdateItineraryInput,
  UpdateRestaurantInput,
  canTransition,
} from './domain';
export type { HotelView, ItineraryDayView, ItineraryView, RestaurantView } from './domain';

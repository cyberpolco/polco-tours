// weather module — public interface. Other modules import ONLY from here.
export { weatherService } from './service';
export type { CurrentConditionsView, ForecastDayView, TownSummaryView, TownWeatherView } from './domain';

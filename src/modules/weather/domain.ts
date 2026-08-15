// weather module — pure types, no Prisma/framework imports. Composes
// src/lib/weather-towns.ts (static reference data) with an external
// gateway's result; owns no table of its own (same "no repository.ts" shape
// as insights/tracking).
import type { WeatherTown } from '@lib/weather-towns';

export interface CurrentConditionsView {
  temperatureCelsius: number;
  feelsLikeCelsius: number;
  conditionText: string;
  precipitationProbabilityPct: number | null;
  windSpeedKph: number | null;
  humidityPct: number | null;
}

export interface ForecastDayView {
  date: string; // ISO date, YYYY-MM-DD
  minTemperatureCelsius: number;
  maxTemperatureCelsius: number;
  conditionText: string;
  precipitationProbabilityPct: number | null;
}

export interface TownWeatherView {
  slug: string;
  name: string;
  country: WeatherTown['country'];
  seasonalNotes: string;
  // Null when the live Weather API call failed/timed out/isn't configured --
  // charter rule 8: a page render must never hard-fail just because a
  // third-party integration is degraded. The town/seasonalNotes fields
  // above always render; these two are the only things that go missing.
  current: CurrentConditionsView | null;
  forecast: ForecastDayView[] | null;
}

export interface TownSummaryView {
  slug: string;
  name: string;
  country: WeatherTown['country'];
  current: CurrentConditionsView | null;
}

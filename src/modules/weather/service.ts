// weather module — service. Fully public read path: NO AuthContext at all,
// same "no ctx exists for these callers" precedent as cms/service.ts's
// getPublicTextBlock/listPublicFaqEntries -- there is no staff-
// authenticated half to this module, since the town list is a static config
// (src/lib/weather-towns.ts), not a DB table staff edit through a
// permission-gated route.
import { getCachedWeather, setCachedWeather } from '@lib/weather-cache';
import { findWeatherTown, WEATHER_TOWNS, type WeatherTown } from '@lib/weather-towns';
import type { CurrentConditionsView, ForecastDayView, TownSummaryView, TownWeatherView } from './domain';
import { WeatherGatewayError, weatherGateway } from './gateway';

const FORECAST_DAYS = 7;
const CURRENT_TTL_SECONDS = 30 * 60; // 30 min
const FORECAST_TTL_SECONDS = 10 * 60 * 60; // 10 hr

/** Charter rule 8: a WeatherGatewayError degrades to `null` here rather than
 * propagating -- callers (the guest pages) always get a renderable view,
 * just with live data missing, never a crash. Any other error (a real bug,
 * not a third-party failure) still propagates. */
async function fetchCurrentConditions(town: WeatherTown): Promise<CurrentConditionsView | null> {
  const cacheKey = `weather:current:${town.slug}`;
  const cached = await getCachedWeather<CurrentConditionsView>(cacheKey);
  if (cached) return cached;

  try {
    const result = await weatherGateway.getCurrentConditions(town.coordinates.latitude, town.coordinates.longitude);
    await setCachedWeather(cacheKey, result, CURRENT_TTL_SECONDS);
    return result;
  } catch (err) {
    if (err instanceof WeatherGatewayError) return null;
    throw err;
  }
}

async function fetchForecast(town: WeatherTown): Promise<ForecastDayView[] | null> {
  const cacheKey = `weather:forecast:${town.slug}`;
  const cached = await getCachedWeather<ForecastDayView[]>(cacheKey);
  if (cached) return cached;

  try {
    const result = await weatherGateway.getDailyForecast(town.coordinates.latitude, town.coordinates.longitude, FORECAST_DAYS);
    await setCachedWeather(cacheKey, result, FORECAST_TTL_SECONDS);
    return result;
  } catch (err) {
    if (err instanceof WeatherGatewayError) return null;
    throw err;
  }
}

export const weatherService = {
  /** Returns null for a slug that isn't in the static town list -- the page
   * calls notFound() in that case, same convention as a bad booking/package
   * id elsewhere in this app. */
  async getPublicTownWeather(slug: string): Promise<TownWeatherView | null> {
    const town = findWeatherTown(slug);
    if (!town) return null;

    const [current, forecast] = await Promise.all([fetchCurrentConditions(town), fetchForecast(town)]);
    return { slug: town.slug, name: town.name, country: town.country, seasonalNotes: town.seasonalNotes, current, forecast };
  },

  /** Every town's current-conditions lookup runs concurrently -- these are
   * external HTTP calls with no DB connection involved, so (unlike
   * tracking/service.ts's sequential composition, which exists specifically
   * to avoid exhausting this sandbox's Postgres connection pool) there's no
   * reason to serialize them. One town's failure never blocks another's
   * (each degrades to null independently). */
  async listPublicTowns(): Promise<TownSummaryView[]> {
    return Promise.all(
      WEATHER_TOWNS.map(async (town) => ({
        slug: town.slug,
        name: town.name,
        country: town.country,
        current: await fetchCurrentConditions(town),
      })),
    );
  },
};

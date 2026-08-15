// weather module — Google Weather API gateway (charter rule 8: third-party
// integrations must be wrapped so an outage never crashes the request).
// Server-only: reads GOOGLE_MAPS_SERVER_API_KEY, never NEXT_PUBLIC_-prefixed
// -- the same server key already used by itinerary/gateway.ts's
// StaticMapsGateway and scripts/backfill-coordinates.ts. The Weather API
// product needs enabling on that key's Google Cloud project and adding to
// its API restriction list before this works in production (see DR-113 /
// the new Open Item in CLAUDE.md) -- a manual step, not a code change.
//
// Diverges from itinerary/gateway.ts's StaticMapsGateway in one deliberate
// way: this adds ONE bounded retry on a genuine failure (never on a
// timeout/abort), mirroring notifications/gateway.ts's ResendEmailGateway
// rule. That gateway backs a low-frequency, admin-only PDF download where a
// failure surfaces as a visible 5xx to staff; this backs a high-traffic
// public content page where a transient blip would otherwise silently blank
// out a real guest's view with no visible error at all, so the extra
// resilience is worth it here. Still deliberately no circuit breaker -- call
// volume is already bounded by weather-cache.ts, so the rapid-repeated-
// failure scenario a breaker protects against doesn't really arise at this
// scale (documented narrowing of charter rule 8, same discipline other DRs
// use rather than silently deviating from it).
import { z } from 'zod';

export class WeatherGatewayError extends Error {}

export interface CurrentConditionsResult {
  temperatureCelsius: number;
  feelsLikeCelsius: number;
  conditionText: string;
  precipitationProbabilityPct: number | null;
  windSpeedKph: number | null;
  humidityPct: number | null;
}

export interface ForecastDayResult {
  date: string;
  minTemperatureCelsius: number;
  maxTemperatureCelsius: number;
  conditionText: string;
  precipitationProbabilityPct: number | null;
}

export interface WeatherGateway {
  getCurrentConditions(lat: number, lng: number): Promise<CurrentConditionsResult>;
  getDailyForecast(lat: number, lng: number, days: number): Promise<ForecastDayResult[]>;
}

const BASE_URL = 'https://weather.googleapis.com/v1';

// Permissive on purpose -- pull out only the fields this app actually
// renders; never trust/render a raw third-party response wholesale, per
// this app's security posture ("third-party responses must be
// schema-validated and quarantined, never trusted or rendered raw").
const CurrentConditionsResponse = z.object({
  temperature: z.object({ degrees: z.number() }),
  feelsLikeTemperature: z.object({ degrees: z.number() }).optional(),
  weatherCondition: z.object({ description: z.object({ text: z.string() }) }),
  precipitation: z
    .object({ probability: z.object({ percent: z.number() }).optional() })
    .optional(),
  wind: z.object({ speed: z.object({ value: z.number() }).optional() }).optional(),
  relativeHumidity: z.number().optional(),
});

const ForecastDaysResponse = z.object({
  forecastDays: z.array(
    z.object({
      interval: z.object({ startTime: z.string() }),
      minTemperature: z.object({ degrees: z.number() }),
      maxTemperature: z.object({ degrees: z.number() }),
      daytimeForecast: z.object({
        weatherCondition: z.object({ description: z.object({ text: z.string() }) }),
        precipitation: z
          .object({ probability: z.object({ percent: z.number() }).optional() })
          .optional(),
      }),
    }),
  ),
});

function isTimeoutOrAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
}

/** One retry on a genuine failure, never on a timeout/abort -- same rule as
 * notifications/gateway.ts's withRetry, duplicated locally rather than
 * imported (module boundary rule: only that module's index.ts is a valid
 * import surface for other modules, and this helper isn't exported through
 * it -- this repo has no shared cross-module fetch-with-timeout/retry
 * utility today, confirmed against every existing gateway.ts). */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isTimeoutOrAbort(err)) throw err;
    return fn();
  }
}

class GoogleWeatherGateway implements WeatherGateway {
  private requireApiKey(): string {
    const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
    if (!apiKey) throw new WeatherGatewayError('GOOGLE_MAPS_SERVER_API_KEY not configured');
    return apiKey;
  }

  async getCurrentConditions(lat: number, lng: number): Promise<CurrentConditionsResult> {
    const apiKey = this.requireApiKey();
    const params = new URLSearchParams({
      key: apiKey,
      'location.latitude': String(lat),
      'location.longitude': String(lng),
    });

    try {
      const json = await withRetry(async () => {
        const res = await fetch(`${BASE_URL}/currentConditions:lookup?${params.toString()}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) throw new Error(`Weather API responded ${res.status}`);
        return CurrentConditionsResponse.parse(await res.json());
      });
      return {
        temperatureCelsius: json.temperature.degrees,
        feelsLikeCelsius: json.feelsLikeTemperature?.degrees ?? json.temperature.degrees,
        conditionText: json.weatherCondition.description.text,
        precipitationProbabilityPct: json.precipitation?.probability?.percent ?? null,
        windSpeedKph: json.wind?.speed?.value ?? null,
        humidityPct: json.relativeHumidity ?? null,
      };
    } catch (err) {
      if (err instanceof WeatherGatewayError) throw err;
      throw new WeatherGatewayError('Failed to fetch current conditions');
    }
  }

  async getDailyForecast(lat: number, lng: number, days: number): Promise<ForecastDayResult[]> {
    const apiKey = this.requireApiKey();
    const params = new URLSearchParams({
      key: apiKey,
      'location.latitude': String(lat),
      'location.longitude': String(lng),
      days: String(days),
    });

    try {
      const json = await withRetry(async () => {
        const res = await fetch(`${BASE_URL}/forecast/days:lookup?${params.toString()}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) throw new Error(`Weather API responded ${res.status}`);
        return ForecastDaysResponse.parse(await res.json());
      });
      return json.forecastDays.map((day) => ({
        date: day.interval.startTime.slice(0, 10),
        minTemperatureCelsius: day.minTemperature.degrees,
        maxTemperatureCelsius: day.maxTemperature.degrees,
        conditionText: day.daytimeForecast.weatherCondition.description.text,
        precipitationProbabilityPct: day.daytimeForecast.precipitation?.probability?.percent ?? null,
      }));
    } catch (err) {
      if (err instanceof WeatherGatewayError) throw err;
      throw new WeatherGatewayError('Failed to fetch daily forecast');
    }
  }
}

export const weatherGateway: WeatherGateway = new GoogleWeatherGateway();

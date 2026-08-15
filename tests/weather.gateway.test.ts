import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WeatherGatewayError, weatherGateway } from '../src/modules/weather/gateway';

const CURRENT_CONDITIONS_RESPONSE = {
  temperature: { degrees: 24.5 },
  feelsLikeTemperature: { degrees: 25 },
  weatherCondition: { description: { text: 'Partly cloudy' } },
  precipitation: { probability: { percent: 10 } },
  wind: { speed: { value: 12 } },
  relativeHumidity: 45,
};

const FORECAST_RESPONSE = {
  forecastDays: [
    {
      interval: { startTime: '2026-08-20T00:00:00Z' },
      minTemperature: { degrees: 15 },
      maxTemperature: { degrees: 28 },
      daytimeForecast: {
        weatherCondition: { description: { text: 'Sunny' } },
        precipitation: { probability: { percent: 5 } },
      },
    },
  ],
};

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

/**
 * Deep-imports the singleton gateway (not the class) since, unlike
 * notifications/gateway.ts's per-instance circuit breaker, this gateway has
 * no per-instance state to isolate -- matches notifications.gateway.test.ts's
 * overall structure otherwise (stubbed global fetch, stubbed env per case).
 */
describe('weather gateway (DR-113)', () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    fetchSpy.mockReset();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe('graceful degradation when unconfigured', () => {
    it('getCurrentConditions throws without GOOGLE_MAPS_SERVER_API_KEY, never calling fetch', async () => {
      await expect(weatherGateway.getCurrentConditions(-22.56, 17.07)).rejects.toBeInstanceOf(WeatherGatewayError);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('getDailyForecast throws without GOOGLE_MAPS_SERVER_API_KEY, never calling fetch', async () => {
      await expect(weatherGateway.getDailyForecast(-22.56, 17.07, 7)).rejects.toBeInstanceOf(WeatherGatewayError);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('successful responses', () => {
    it('parses current conditions into the app-shaped view', async () => {
      vi.stubEnv('GOOGLE_MAPS_SERVER_API_KEY', 'test-key');
      fetchSpy.mockResolvedValue(jsonResponse(CURRENT_CONDITIONS_RESPONSE));

      const result = await weatherGateway.getCurrentConditions(-22.56, 17.07);
      expect(result).toEqual({
        temperatureCelsius: 24.5,
        feelsLikeCelsius: 25,
        conditionText: 'Partly cloudy',
        precipitationProbabilityPct: 10,
        windSpeedKph: 12,
        humidityPct: 45,
      });
    });

    it('parses a daily forecast into the app-shaped view', async () => {
      vi.stubEnv('GOOGLE_MAPS_SERVER_API_KEY', 'test-key');
      fetchSpy.mockResolvedValue(jsonResponse(FORECAST_RESPONSE));

      const result = await weatherGateway.getDailyForecast(-22.56, 17.07, 7);
      expect(result).toEqual([
        {
          date: '2026-08-20',
          minTemperatureCelsius: 15,
          maxTemperatureCelsius: 28,
          conditionText: 'Sunny',
          precipitationProbabilityPct: 5,
        },
      ]);
    });
  });

  describe('failure modes all collapse to WeatherGatewayError', () => {
    it('a non-2xx response throws WeatherGatewayError', async () => {
      vi.stubEnv('GOOGLE_MAPS_SERVER_API_KEY', 'test-key');
      fetchSpy.mockResolvedValue(jsonResponse({}, false, 403));
      await expect(weatherGateway.getCurrentConditions(-22.56, 17.07)).rejects.toBeInstanceOf(WeatherGatewayError);
    });

    it('a malformed/unexpected response shape throws WeatherGatewayError, not a raw parse error', async () => {
      vi.stubEnv('GOOGLE_MAPS_SERVER_API_KEY', 'test-key');
      fetchSpy.mockResolvedValue(jsonResponse({ unexpected: 'shape' }));
      await expect(weatherGateway.getCurrentConditions(-22.56, 17.07)).rejects.toBeInstanceOf(WeatherGatewayError);
    });
  });

  describe('retry policy', () => {
    it('retries once on a genuine failure, then succeeds', async () => {
      vi.stubEnv('GOOGLE_MAPS_SERVER_API_KEY', 'test-key');
      fetchSpy.mockRejectedValueOnce(new Error('network error')).mockResolvedValueOnce(jsonResponse(CURRENT_CONDITIONS_RESPONSE));

      const result = await weatherGateway.getCurrentConditions(-22.56, 17.07);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result.conditionText).toBe('Partly cloudy');
    });

    it('throws WeatherGatewayError once the retry is also exhausted', async () => {
      vi.stubEnv('GOOGLE_MAPS_SERVER_API_KEY', 'test-key');
      fetchSpy.mockRejectedValue(new Error('network error'));
      await expect(weatherGateway.getCurrentConditions(-22.56, 17.07)).rejects.toBeInstanceOf(WeatherGatewayError);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('does NOT retry on a timeout/abort', async () => {
      vi.stubEnv('GOOGLE_MAPS_SERVER_API_KEY', 'test-key');
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'TimeoutError';
      fetchSpy.mockRejectedValue(abortErr);

      await expect(weatherGateway.getCurrentConditions(-22.56, 17.07)).rejects.toBeInstanceOf(WeatherGatewayError);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });
});

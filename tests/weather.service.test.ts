import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Mocks the gateway/cache module boundaries directly (same convention
 * tests/api/booking-setup.api.test.ts uses for its uploadMock/downloadMock)
 * so this is deterministic and doesn't depend on real network/timeout
 * behavior -- weather.gateway.test.ts already covers the gateway itself.
 * The WeatherGatewayError class is created inside vi.hoisted so the SAME
 * class reference is used both by the mock factory's export and by test
 * bodies constructing a rejection -- required for service.ts's own
 * `err instanceof WeatherGatewayError` check to actually match.
 */
const { getCurrentConditionsMock, getDailyForecastMock, WeatherGatewayErrorForTest } = vi.hoisted(() => {
  class WeatherGatewayErrorForTest extends Error {}
  return {
    getCurrentConditionsMock: vi.fn(),
    getDailyForecastMock: vi.fn(),
    WeatherGatewayErrorForTest,
  };
});
vi.mock('../src/modules/weather/gateway', () => ({
  WeatherGatewayError: WeatherGatewayErrorForTest,
  weatherGateway: { getCurrentConditions: getCurrentConditionsMock, getDailyForecast: getDailyForecastMock },
}));

const { getCachedWeatherMock, setCachedWeatherMock } = vi.hoisted(() => ({
  getCachedWeatherMock: vi.fn(async (_key: string) => null as unknown),
  setCachedWeatherMock: vi.fn(async (_key: string, _value: unknown, _ttlSeconds: number) => undefined),
}));
vi.mock('@lib/weather-cache', () => ({
  getCachedWeather: getCachedWeatherMock,
  setCachedWeather: setCachedWeatherMock,
}));

const { weatherService } = await import('../src/modules/weather/service');

const FAKE_CURRENT = {
  temperatureCelsius: 24,
  feelsLikeCelsius: 25,
  conditionText: 'Sunny',
  precipitationProbabilityPct: 0,
  windSpeedKph: 5,
  humidityPct: 30,
};
const FAKE_FORECAST = [
  { date: '2026-08-20', minTemperatureCelsius: 15, maxTemperatureCelsius: 28, conditionText: 'Sunny', precipitationProbabilityPct: 0 },
];

describe('weatherService (DR-113)', () => {
  beforeEach(() => {
    getCurrentConditionsMock.mockReset();
    getDailyForecastMock.mockReset();
    getCachedWeatherMock.mockReset().mockResolvedValue(null);
    setCachedWeatherMock.mockReset().mockResolvedValue(undefined);
  });

  describe('getPublicTownWeather', () => {
    it('returns null for an unrecognized slug -- the page calls notFound()', async () => {
      const result = await weatherService.getPublicTownWeather('not-a-real-town');
      expect(result).toBeNull();
      expect(getCurrentConditionsMock).not.toHaveBeenCalled();
    });

    it('returns a full view and populates the cache on a cache miss', async () => {
      getCurrentConditionsMock.mockResolvedValue(FAKE_CURRENT);
      getDailyForecastMock.mockResolvedValue(FAKE_FORECAST);

      const result = await weatherService.getPublicTownWeather('windhoek');
      expect(result?.name).toBe('Windhoek');
      expect(result?.current?.conditionText).toBe('Sunny');
      expect(result?.forecast).toHaveLength(1);
      expect(setCachedWeatherMock).toHaveBeenCalledTimes(2); // current + forecast
    });

    it('serves from cache on a hit, never calling the gateway', async () => {
      getCachedWeatherMock.mockImplementation(async (key: string) =>
        key.startsWith('weather:current:') ? FAKE_CURRENT : FAKE_FORECAST,
      );

      const result = await weatherService.getPublicTownWeather('windhoek');
      expect(result?.current).toEqual(FAKE_CURRENT);
      expect(result?.forecast).toEqual(FAKE_FORECAST);
      expect(getCurrentConditionsMock).not.toHaveBeenCalled();
      expect(getDailyForecastMock).not.toHaveBeenCalled();
    });

    it('degrades to null current/forecast when the gateway throws WeatherGatewayError -- never crashes', async () => {
      getCurrentConditionsMock.mockRejectedValue(new WeatherGatewayErrorForTest('down'));
      getDailyForecastMock.mockRejectedValue(new WeatherGatewayErrorForTest('down'));

      const result = await weatherService.getPublicTownWeather('windhoek');
      expect(result?.name).toBe('Windhoek');
      expect(result?.seasonalNotes).toBeTruthy();
      expect(result?.current).toBeNull();
      expect(result?.forecast).toBeNull();
    });

    it('re-throws a non-WeatherGatewayError -- a real bug must still surface, not silently degrade', async () => {
      getCurrentConditionsMock.mockRejectedValue(new Error('unexpected bug'));
      getDailyForecastMock.mockResolvedValue(FAKE_FORECAST);
      await expect(weatherService.getPublicTownWeather('windhoek')).rejects.toThrow('unexpected bug');
    });
  });

  describe('listPublicTowns', () => {
    it("one town's gateway failure degrades independently, never blocking the others", async () => {
      getCurrentConditionsMock.mockImplementation(async (lat: number) =>
        lat === -22.5609 // Windhoek's latitude
          ? Promise.reject(new WeatherGatewayErrorForTest('down'))
          : FAKE_CURRENT,
      );

      const towns = await weatherService.listPublicTowns();
      const windhoek = towns.find((t) => t.slug === 'windhoek');
      const another = towns.find((t) => t.slug === 'swakopmund');
      expect(windhoek?.current).toBeNull();
      expect(another?.current).toEqual(FAKE_CURRENT);
    });
  });
});

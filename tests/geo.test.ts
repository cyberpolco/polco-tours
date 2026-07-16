import { describe, it, expect } from 'vitest';
import { haversineDistanceKm } from '../src/lib/geo';

describe('haversineDistanceKm', () => {
  it('is 0 for the same point', () => {
    expect(haversineDistanceKm({ latitude: -22.57, longitude: 17.08 }, { latitude: -22.57, longitude: 17.08 })).toBe(0);
  });

  it('roughly matches the known Windhoek-to-Walvis Bay distance (~300km)', () => {
    // Windhoek, Namibia -> Walvis Bay, Namibia
    const windhoek = { latitude: -22.5609, longitude: 17.0658 };
    const walvisBay = { latitude: -22.9576, longitude: 14.5053 };
    const km = haversineDistanceKm(windhoek, walvisBay);
    expect(km).toBeGreaterThan(250);
    expect(km).toBeLessThan(350);
  });

  it('is symmetric', () => {
    const a = { latitude: -22.57, longitude: 17.08 };
    const b = { latitude: -4.32, longitude: 15.31 };
    expect(haversineDistanceKm(a, b)).toBeCloseTo(haversineDistanceKm(b, a), 10);
  });
});

import { describe, it, expect } from 'vitest';
import { computeLateBookingSurchargeBp } from '../src/lib/late-booking-rate';

const RATE = { thresholdDays: 21, surchargeRateBp: 500 };

describe('computeLateBookingSurchargeBp (DR-198)', () => {
  it('returns null when the travel date is comfortably beyond the threshold', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const travelDate = new Date('2026-03-01T00:00:00Z'); // ~59 days out
    expect(computeLateBookingSurchargeBp(travelDate, RATE, now)).toBeNull();
  });

  it('returns the surcharge bp when the travel date is well within the threshold', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const travelDate = new Date('2026-01-05T00:00:00Z'); // 4 days out
    expect(computeLateBookingSurchargeBp(travelDate, RATE, now)).toBe(500);
  });

  it('exactly at the threshold (thresholdDays away) is NOT late -- only strictly fewer days triggers it', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const travelDate = new Date('2026-01-22T00:00:00Z'); // exactly 21 days out
    expect(computeLateBookingSurchargeBp(travelDate, RATE, now)).toBeNull();
  });

  it('one day inside the threshold is late', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const travelDate = new Date('2026-01-21T00:00:00Z'); // 20 days out
    expect(computeLateBookingSurchargeBp(travelDate, RATE, now)).toBe(500);
  });

  it('a travel date in the past is late (booking after the trip already started)', () => {
    const now = new Date('2026-01-15T00:00:00Z');
    const travelDate = new Date('2026-01-01T00:00:00Z');
    expect(computeLateBookingSurchargeBp(travelDate, RATE, now)).toBe(500);
  });
});

import { describe, it, expect } from 'vitest';
import { computeBookingsSummary, resolveBookingCountry, utilizationRatio } from '../src/modules/insights/domain';

describe('insights domain', () => {
  describe('computeBookingsSummary', () => {
    it('counts total, active tours (IN_PROGRESS), and pending quotations', () => {
      const summary = computeBookingsSummary([
        'DRAFT',
        'AWAITING_QUOTATION',
        'QUOTATION_SENT',
        'IN_PROGRESS',
        'IN_PROGRESS',
        'COMPLETED',
        'CANCELLED',
      ]);
      expect(summary.totalBookings).toBe(7);
      expect(summary.activeTours).toBe(2);
      expect(summary.pendingQuotations).toBe(2);
    });

    it('excludes DRAFT from the conversion-rate denominator', () => {
      const summary = computeBookingsSummary(['DRAFT', 'DRAFT', 'CONFIRMED']);
      expect(summary.conversionRate).toBe(1); // 1 confirmed / 1 non-draft
    });

    it('computes conversion rate as CONFIRMED-or-further over non-draft total', () => {
      const summary = computeBookingsSummary([
        'AWAITING_QUOTATION',
        'QUOTATION_SENT',
        'CONFIRMED',
        'IN_PROGRESS',
        'COMPLETED',
        'CANCELLED',
      ]);
      // 3 confirmed-or-further (CONFIRMED, IN_PROGRESS, COMPLETED) / 6 non-draft
      expect(summary.conversionRate).toBeCloseTo(0.5, 5);
    });

    it('is 0 when there are no non-draft bookings at all', () => {
      const summary = computeBookingsSummary(['DRAFT']);
      expect(summary.conversionRate).toBe(0);
    });

    it('handles an empty list', () => {
      const summary = computeBookingsSummary([]);
      expect(summary).toEqual({ totalBookings: 0, activeTours: 0, pendingQuotations: 0, conversionRate: 0 });
    });
  });

  describe('utilizationRatio', () => {
    it('is a plain ratio, capped at 1', () => {
      expect(utilizationRatio(2, 4)).toBe(0.5);
      expect(utilizationRatio(4, 4)).toBe(1);
      expect(utilizationRatio(5, 4)).toBe(1); // never reads as >100%
    });

    it('is 0 when there is no ACTIVE fleet to divide by', () => {
      expect(utilizationRatio(0, 0)).toBe(0);
      expect(utilizationRatio(3, 0)).toBe(0);
    });
  });

  describe('resolveBookingCountry', () => {
    it('prefers customCountry when set (TAILOR_MADE)', () => {
      expect(resolveBookingCountry('CD', 'NA')).toBe('CD');
      expect(resolveBookingCountry('CD', undefined)).toBe('CD');
    });

    it('falls back to the departure/package country when customCountry is null', () => {
      expect(resolveBookingCountry(null, 'NA')).toBe('NA');
    });

    it('falls back to Unknown when neither is available', () => {
      expect(resolveBookingCountry(null, undefined)).toBe('Unknown');
    });
  });
});

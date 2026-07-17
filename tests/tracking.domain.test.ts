import { describe, it, expect } from 'vitest';
import { locationFreshness, resolveTripProgress } from '../src/modules/tracking/domain';

describe('tracking domain', () => {
  describe('resolveTripProgress', () => {
    it('is NOT_STARTED before the departure start date', () => {
      const progress = resolveTripProgress(new Date('2026-08-01'), new Date('2026-08-05'), new Date('2026-07-30'));
      expect(progress).toEqual({ status: 'NOT_STARTED', dayNumber: null, totalDays: null, percentComplete: 0 });
    });

    it('is COMPLETED after the departure end date', () => {
      const progress = resolveTripProgress(new Date('2026-08-01'), new Date('2026-08-05'), new Date('2026-08-06'));
      expect(progress).toEqual({ status: 'COMPLETED', dayNumber: null, totalDays: null, percentComplete: 100 });
    });

    it('computes day number/total days/percent while in progress', () => {
      // 5-day trip (Aug 1 -> Aug 5 inclusive), checking on day 3 (Aug 3)
      const progress = resolveTripProgress(new Date('2026-08-01'), new Date('2026-08-05'), new Date('2026-08-03'));
      expect(progress.status).toBe('IN_PROGRESS');
      expect(progress.dayNumber).toBe(3);
      expect(progress.totalDays).toBe(5);
      expect(progress.percentComplete).toBe(60);
    });

    it('is IN_PROGRESS on the exact start date (day 1)', () => {
      const progress = resolveTripProgress(new Date('2026-08-01'), new Date('2026-08-05'), new Date('2026-08-01'));
      expect(progress.status).toBe('IN_PROGRESS');
      expect(progress.dayNumber).toBe(1);
      expect(progress.percentComplete).toBe(20);
    });

    it('is IN_PROGRESS on the exact end date (last day), not yet COMPLETED', () => {
      const progress = resolveTripProgress(new Date('2026-08-01'), new Date('2026-08-05'), new Date('2026-08-05'));
      expect(progress.status).toBe('IN_PROGRESS');
      expect(progress.dayNumber).toBe(5);
      expect(progress.percentComplete).toBe(100);
    });

    it('returns a null totalDays/percentComplete for an open-ended trip (no endDate)', () => {
      const progress = resolveTripProgress(new Date('2026-08-01'), null, new Date('2026-08-04'));
      expect(progress.status).toBe('IN_PROGRESS');
      expect(progress.dayNumber).toBe(4);
      expect(progress.totalDays).toBeNull();
      expect(progress.percentComplete).toBeNull();
    });

    it('never reads as NOT_STARTED/COMPLETED for an open-ended trip (no endDate to compare against)', () => {
      const progress = resolveTripProgress(new Date('2026-08-01'), null, new Date('2027-01-01'));
      expect(progress.status).toBe('IN_PROGRESS');
    });
  });

  describe('locationFreshness', () => {
    it('is UNKNOWN when no location has ever been recorded', () => {
      expect(locationFreshness(null, new Date('2026-08-01T12:00:00Z'))).toBe('UNKNOWN');
    });

    it('is FRESH within the 24h window', () => {
      const lastLocationAt = new Date('2026-08-01T00:00:00Z');
      const now = new Date('2026-08-01T23:00:00Z');
      expect(locationFreshness(lastLocationAt, now)).toBe('FRESH');
    });

    it('is STALE past the 24h window', () => {
      const lastLocationAt = new Date('2026-08-01T00:00:00Z');
      const now = new Date('2026-08-02T01:00:00Z');
      expect(locationFreshness(lastLocationAt, now)).toBe('STALE');
    });
  });
});

import { describe, it, expect } from 'vitest';
import { isDormant } from '../src/modules/auth/domain';

describe('auth domain', () => {
  describe('isDormant (DR-084)', () => {
    const now = new Date('2026-08-07T00:00:00Z');

    it('is not dormant right at the reference date', () => {
      expect(isDormant(now, now)).toBe(false);
    });

    it('is not dormant within the 30-day window', () => {
      const twentyNineDaysAgo = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
      expect(isDormant(twentyNineDaysAgo, now)).toBe(false);
    });

    it('is not dormant exactly at the 30-day boundary', () => {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      expect(isDormant(thirtyDaysAgo, now)).toBe(false);
    });

    it('is dormant just past the 30-day boundary', () => {
      const justOver = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
      expect(isDormant(justOver, now)).toBe(true);
    });

    it('is dormant for a reference date a year ago', () => {
      const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      expect(isDormant(yearAgo, now)).toBe(true);
    });
  });
});

import { describe, it, expect } from 'vitest';
import {
  canAutoIssueRatingCode,
  canIssueRatingCode,
  canSubmitRating,
  generateRatingCode,
  isRatingCodeUsable,
  ratingCodeExpiryFromTourEnd,
  RatingCodeLookupInput,
  SubmitRatingInput,
  tomorrowUtcDayRange,
} from '../src/modules/ratings/domain';

describe('ratings domain', () => {
  describe('generateRatingCode', () => {
    it('produces an 8-char unambiguous code', () => {
      const code = generateRatingCode();
      expect(code).toHaveLength(8);
      expect(code).not.toMatch(/[0O1I]/);
    });

    it('is not deterministic', () => {
      expect(generateRatingCode()).not.toBe(generateRatingCode());
    });
  });

  describe('ratingCodeExpiryFromTourEnd', () => {
    it('expires exactly 5 days after the tour end date, not from today', () => {
      const tourEndDate = new Date('2026-01-01T00:00:00Z');
      const expiry = ratingCodeExpiryFromTourEnd(tourEndDate);
      expect(expiry.getTime() - tourEndDate.getTime()).toBe(5 * 24 * 60 * 60 * 1000);
    });
  });

  describe('isRatingCodeUsable', () => {
    const now = new Date('2026-06-01T00:00:00Z');

    it('is usable when unused and not yet expired', () => {
      expect(isRatingCodeUsable({ usedAt: null, expiresAt: new Date('2026-07-01T00:00:00Z') }, now)).toBe(true);
    });

    it('is not usable once used', () => {
      expect(isRatingCodeUsable({ usedAt: new Date('2026-05-01T00:00:00Z'), expiresAt: new Date('2026-07-01T00:00:00Z') }, now)).toBe(false);
    });

    it('is not usable once expired', () => {
      expect(isRatingCodeUsable({ usedAt: null, expiresAt: new Date('2026-05-01T00:00:00Z') }, now)).toBe(false);
    });
  });

  describe('canIssueRatingCode', () => {
    it('allows issuing once the invoice is PAID and no code exists yet', () => {
      expect(canIssueRatingCode({ invoiceStatus: 'PAID', alreadyIssued: false })).toBe(true);
    });

    it('blocks issuing when not yet PAID', () => {
      expect(canIssueRatingCode({ invoiceStatus: 'PARTIALLY_PAID', alreadyIssued: false })).toBe(false);
      expect(canIssueRatingCode({ invoiceStatus: null, alreadyIssued: false })).toBe(false);
    });

    it('blocks re-issuing once a code already exists', () => {
      expect(canIssueRatingCode({ invoiceStatus: 'PAID', alreadyIssued: true })).toBe(false);
    });
  });

  describe('canAutoIssueRatingCode (DR-261)', () => {
    it('allows auto-issuing regardless of invoice status, unlike canIssueRatingCode', () => {
      expect(canAutoIssueRatingCode({ bookingStatus: 'CONFIRMED', alreadyIssued: false })).toBe(true);
      expect(canAutoIssueRatingCode({ bookingStatus: 'AWAITING_DEPOSIT', alreadyIssued: false })).toBe(true);
    });

    it('blocks re-issuing once a code already exists', () => {
      expect(canAutoIssueRatingCode({ bookingStatus: 'CONFIRMED', alreadyIssued: true })).toBe(false);
    });

    it('blocks a cancelled or refunded booking -- its tour is not happening', () => {
      expect(canAutoIssueRatingCode({ bookingStatus: 'CANCELLED', alreadyIssued: false })).toBe(false);
      expect(canAutoIssueRatingCode({ bookingStatus: 'REFUNDED', alreadyIssued: false })).toBe(false);
    });
  });

  describe('tomorrowUtcDayRange (DR-261)', () => {
    it('returns the [start, end) UTC range for the calendar day after `now`', () => {
      const now = new Date('2026-06-01T19:00:00Z');
      const { start, end } = tomorrowUtcDayRange(now);
      expect(start.toISOString()).toBe('2026-06-02T00:00:00.000Z');
      expect(end.toISOString()).toBe('2026-06-03T00:00:00.000Z');
    });

    it('correctly rolls over a month/year boundary', () => {
      const { start, end } = tomorrowUtcDayRange(new Date('2025-12-31T19:00:00Z'));
      expect(start.toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(end.toISOString()).toBe('2026-01-02T00:00:00.000Z');
    });

    it('is unaffected by a non-midnight time-of-day on `now`', () => {
      const a = tomorrowUtcDayRange(new Date('2026-06-01T00:00:01Z'));
      const b = tomorrowUtcDayRange(new Date('2026-06-01T23:59:59Z'));
      expect(a.start.toISOString()).toBe(b.start.toISOString());
      expect(a.end.toISOString()).toBe(b.end.toISOString());
    });
  });

  describe('canSubmitRating', () => {
    const tourEndDate = new Date('2026-06-01T00:00:00Z');

    it('allows submission starting the day after the tour ends (24h past tour end)', () => {
      const now = new Date(tourEndDate.getTime() + 24 * 60 * 60 * 1000);
      expect(canSubmitRating({ bookingStatus: 'COMPLETED', invoiceStatus: 'PAID', tourEndDate, now })).toBe(true);
    });

    it('blocks submission before the day after the tour ends', () => {
      const now = new Date(tourEndDate.getTime() + 23 * 60 * 60 * 1000);
      expect(canSubmitRating({ bookingStatus: 'COMPLETED', invoiceStatus: 'PAID', tourEndDate, now })).toBe(false);
    });

    it('blocks submission when the booking is not COMPLETED', () => {
      const now = new Date(tourEndDate.getTime() + 72 * 60 * 60 * 1000);
      expect(canSubmitRating({ bookingStatus: 'IN_PROGRESS', invoiceStatus: 'PAID', tourEndDate, now })).toBe(false);
    });

    it('blocks submission when the invoice is not fully paid', () => {
      const now = new Date(tourEndDate.getTime() + 72 * 60 * 60 * 1000);
      expect(canSubmitRating({ bookingStatus: 'COMPLETED', invoiceStatus: 'PARTIALLY_PAID', tourEndDate, now })).toBe(false);
    });

    it('blocks submission when there is no tour end date on file', () => {
      const now = new Date();
      expect(canSubmitRating({ bookingStatus: 'COMPLETED', invoiceStatus: 'PAID', tourEndDate: null, now })).toBe(false);
    });
  });

  describe('RatingCodeLookupInput', () => {
    it('requires both bookingReference and ratingCode', () => {
      expect(RatingCodeLookupInput.safeParse({ bookingReference: 'POL-2026-000001', ratingCode: 'ABCD1234' }).success).toBe(true);
      expect(RatingCodeLookupInput.safeParse({ bookingReference: 'POL-2026-000001' }).success).toBe(false);
      expect(RatingCodeLookupInput.safeParse({ ratingCode: 'ABCD1234' }).success).toBe(false);
    });
  });

  describe('SubmitRatingInput', () => {
    it('requires overallRating 1-5, defaults driver/guide ratings to empty arrays', () => {
      const result = SubmitRatingInput.safeParse({ overallRating: 5 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.driverRatings).toEqual([]);
        expect(result.data.guideRatings).toEqual([]);
      }
    });

    it('rejects an out-of-range overallRating', () => {
      expect(SubmitRatingInput.safeParse({ overallRating: 0 }).success).toBe(false);
      expect(SubmitRatingInput.safeParse({ overallRating: 6 }).success).toBe(false);
    });

    it('accepts driver/guide subject ratings', () => {
      const result = SubmitRatingInput.safeParse({
        overallRating: 4,
        driverRatings: [{ driverProfileId: '11111111-1111-4111-8111-111111111111', rating: 5 }],
        guideRatings: [{ guideUserId: '22222222-2222-4222-8222-222222222222', rating: 3, comment: 'Great guide' }],
      });
      expect(result.success).toBe(true);
    });
  });
});

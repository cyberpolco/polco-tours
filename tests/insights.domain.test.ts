import { describe, it, expect } from 'vitest';
import {
  bucketByPeriod,
  bucketMoneyByPeriod,
  chooseGranularity,
  clampRangeToEpoch,
  computeBookingsSummary,
  computeFinanceExtras,
  computeGuestSummary,
  DASHBOARD_EPOCH,
  GUEST_GEOGRAPHY_NOT_COLLECTED,
  isInsightsViewer,
  isWithinRange,
  resolveBookingCountry,
  utilizationRatio,
} from '../src/modules/insights/domain';

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

  describe('isInsightsViewer (DR-155)', () => {
    it('allows SUPERADMIN, TOUR_OPERATOR, and PLATFORM_ADMIN', () => {
      expect(isInsightsViewer(['SUPERADMIN'])).toBe(true);
      expect(isInsightsViewer(['TOUR_OPERATOR'])).toBe(true);
      expect(isInsightsViewer(['PLATFORM_ADMIN'])).toBe(true);
    });

    it('denies every other role, even a multi-role holder with no allowed role', () => {
      expect(isInsightsViewer(['TOUR_GUIDE'])).toBe(false);
      expect(isInsightsViewer(['DRIVER', 'VISA_FACILITATOR'])).toBe(false);
      expect(isInsightsViewer(['TOURIST'])).toBe(false);
    });
  });

  describe('clampRangeToEpoch (DR-155: stats never reach earlier than launch day)', () => {
    it('replaces an unbounded ("All time") from with DASHBOARD_EPOCH', () => {
      expect(clampRangeToEpoch({ from: null, to: null })).toEqual({ from: DASHBOARD_EPOCH, to: null });
    });

    it('clamps an explicit from that predates the epoch (e.g. a crafted ?from= param)', () => {
      const result = clampRangeToEpoch({ from: new Date('2020-01-01'), to: null });
      expect(result.from).toEqual(DASHBOARD_EPOCH);
    });

    it('leaves a from after the epoch untouched', () => {
      const laterFrom = new Date('2027-01-01');
      const result = clampRangeToEpoch({ from: laterFrom, to: null });
      expect(result.from).toBe(laterFrom);
    });

    it('never touches `to`', () => {
      const to = new Date('2026-09-01');
      expect(clampRangeToEpoch({ from: null, to }).to).toBe(to);
    });
  });

  describe('isWithinRange', () => {
    const d = (s: string) => new Date(s);

    it('is true for an unbounded range', () => {
      expect(isWithinRange(d('2026-01-01'), { from: null, to: null })).toBe(true);
    });

    it('respects a from-only bound', () => {
      expect(isWithinRange(d('2026-01-01'), { from: d('2026-02-01'), to: null })).toBe(false);
      expect(isWithinRange(d('2026-03-01'), { from: d('2026-02-01'), to: null })).toBe(true);
    });

    it('respects a to-only bound', () => {
      expect(isWithinRange(d('2026-03-01'), { from: null, to: d('2026-02-01') })).toBe(false);
      expect(isWithinRange(d('2026-01-01'), { from: null, to: d('2026-02-01') })).toBe(true);
    });
  });

  describe('chooseGranularity', () => {
    it('picks day-buckets for a range under a month', () => {
      expect(chooseGranularity({ from: new Date('2026-01-01'), to: new Date('2026-01-15') })).toBe('day');
    });

    it('picks week-buckets for a range under ~6 months', () => {
      expect(chooseGranularity({ from: new Date('2026-01-01'), to: new Date('2026-04-01') })).toBe('week');
    });

    it('picks month-buckets for a long range', () => {
      expect(chooseGranularity({ from: new Date('2025-01-01'), to: new Date('2026-06-01') })).toBe('month');
    });

    it('picks month-buckets for an unbounded (all-time) range', () => {
      expect(chooseGranularity({ from: null, to: null })).toBe('month');
    });
  });

  describe('bucketByPeriod', () => {
    it('counts events per day bucket', () => {
      const points = bucketByPeriod([new Date('2026-03-05T01:00:00Z'), new Date('2026-03-05T22:00:00Z'), new Date('2026-03-06T00:00:00Z')], 'day');
      expect(points).toEqual([
        { periodStart: '2026-03-05', value: 2 },
        { periodStart: '2026-03-06', value: 1 },
      ]);
    });

    it('returns an empty array for no events', () => {
      expect(bucketByPeriod([], 'day')).toEqual([]);
    });
  });

  describe('bucketMoneyByPeriod', () => {
    it('sums per currency, never combining currencies (BR-02)', () => {
      const series = bucketMoneyByPeriod(
        [
          { date: new Date('2026-03-05'), currency: 'USD', amountMinor: 1000 },
          { date: new Date('2026-03-05'), currency: 'USD', amountMinor: 500 },
          { date: new Date('2026-03-05'), currency: 'NAD', amountMinor: 2000 },
        ],
        'day',
      );
      const usd = series.find((s) => s.currency === 'USD');
      const nad = series.find((s) => s.currency === 'NAD');
      expect(usd?.points).toEqual([{ periodStart: '2026-03-05', amountMinor: 1500 }]);
      expect(nad?.points).toEqual([{ periodStart: '2026-03-05', amountMinor: 2000 }]);
    });
  });

  describe('computeGuestSummary', () => {
    const touristA = 'tourist-a';
    const touristB = 'tourist-b';
    const range = { from: null, to: null };

    it('classifies a guest as new only when their earliest-ever booking falls in range', () => {
      const allBookings = [
        { touristUserId: touristA, createdAt: new Date('2026-01-01'), status: 'CONFIRMED' as const, origin: 'PREDEFINED_PACKAGE' as const, countryOfResidence: null },
        { touristUserId: touristA, createdAt: new Date('2026-02-01'), status: 'CONFIRMED' as const, origin: 'PREDEFINED_PACKAGE' as const, countryOfResidence: null },
      ];
      // Range excludes the guest's earliest booking -> returning, not new.
      const summary = computeGuestSummary(allBookings, { from: new Date('2026-01-15'), to: null });
      expect(summary.newGuestCount).toBe(0);
      expect(summary.returningGuestCount).toBe(1);
    });

    it('counts a guest as new when their only booking is the one in range', () => {
      const allBookings = [
        { touristUserId: touristB, createdAt: new Date('2026-05-01'), status: 'CONFIRMED' as const, origin: 'TAILOR_MADE' as const, countryOfResidence: 'NA' },
      ];
      const summary = computeGuestSummary(allBookings, range);
      expect(summary.newGuestCount).toBe(1);
      expect(summary.returningGuestCount).toBe(0);
    });

    it('splits by origin and buckets missing geography under GUEST_GEOGRAPHY_NOT_COLLECTED', () => {
      const allBookings = [
        { touristUserId: touristA, createdAt: new Date('2026-01-01'), status: 'CONFIRMED' as const, origin: 'PREDEFINED_PACKAGE' as const, countryOfResidence: null },
        { touristUserId: touristB, createdAt: new Date('2026-01-01'), status: 'AWAITING_QUOTATION' as const, origin: 'TAILOR_MADE' as const, countryOfResidence: 'NA' },
      ];
      const summary = computeGuestSummary(allBookings, range);
      expect(summary.originSplit).toEqual({ predefinedPackage: 1, tailorMade: 1 });
      expect(summary.geography[GUEST_GEOGRAPHY_NOT_COLLECTED]).toBe(1);
      expect(summary.geography.NA).toBe(1);
    });

    it('excludes DRAFT bookings and computes the TAILOR_MADE-only booking-stage funnel', () => {
      const allBookings = [
        { touristUserId: touristA, createdAt: new Date('2026-01-01'), status: 'DRAFT' as const, origin: 'PREDEFINED_PACKAGE' as const, countryOfResidence: null },
        { touristUserId: touristB, createdAt: new Date('2026-01-01'), status: 'AWAITING_QUOTATION' as const, origin: 'TAILOR_MADE' as const, countryOfResidence: null },
        { touristUserId: touristB, createdAt: new Date('2026-01-02'), status: 'CONFIRMED' as const, origin: 'TAILOR_MADE' as const, countryOfResidence: null },
      ];
      const summary = computeGuestSummary(allBookings, range);
      const byStage = Object.fromEntries(summary.bookingStageFunnel.map((s) => [s.stage, s.count]));
      expect(byStage.AWAITING_QUOTATION).toBe(1);
      expect(byStage.CONFIRMED_OR_LATER).toBe(1);
    });

    it('computes cancellationRate over non-DRAFT bookings', () => {
      const allBookings = [
        { touristUserId: touristA, createdAt: new Date('2026-01-01'), status: 'CANCELLED' as const, origin: 'PREDEFINED_PACKAGE' as const, countryOfResidence: null },
        { touristUserId: touristB, createdAt: new Date('2026-01-01'), status: 'CONFIRMED' as const, origin: 'PREDEFINED_PACKAGE' as const, countryOfResidence: null },
      ];
      expect(computeGuestSummary(allBookings, range).cancellationRate).toBeCloseTo(0.5, 5);
    });
  });

  describe('computeFinanceExtras', () => {
    it('averages totalMinor per currency across paid invoices only', () => {
      const extras = computeFinanceExtras(
        [
          {
            currency: 'USD',
            totalMinor: 1000,
            taxMinor: 0,
            platformFeeMinor: null,
            discountMinor: 0,
            couponCode: null,
            createdAt: new Date('2026-01-01'),
            payments: [{ kind: 'FULL', status: 'SUCCEEDED', amountMinor: 1000 }],
          },
          {
            currency: 'USD',
            totalMinor: 2000,
            taxMinor: 0,
            platformFeeMinor: null,
            discountMinor: 0,
            couponCode: null,
            createdAt: new Date('2026-01-01'),
            payments: [{ kind: 'FULL', status: 'PENDING', amountMinor: 2000 }],
          },
        ],
        { from: null, to: null },
      );
      // Only the first invoice has a SUCCEEDED payment -- the unpaid one is excluded.
      expect(extras.averageBookingValue.USD).toBe(1000);
    });

    it('splits deposit-path vs full-path by PaymentKind, and sums tax/platform-fee/discount', () => {
      const extras = computeFinanceExtras(
        [
          {
            currency: 'USD',
            totalMinor: 1000,
            taxMinor: 100,
            platformFeeMinor: 50,
            discountMinor: 20,
            couponCode: 'CPC-26-000000-AA',
            createdAt: new Date('2026-01-01'),
            payments: [{ kind: 'FULL', status: 'SUCCEEDED', amountMinor: 1000 }],
          },
          {
            currency: 'USD',
            totalMinor: 500,
            taxMinor: 50,
            platformFeeMinor: 25,
            discountMinor: 0,
            couponCode: null,
            createdAt: new Date('2026-01-01'),
            payments: [{ kind: 'DEPOSIT', status: 'SUCCEEDED', amountMinor: 200 }],
          },
        ],
        { from: null, to: null },
      );
      expect(extras.depositVsFullPaid).toEqual({ depositPathCount: 1, fullPathCount: 1 });
      expect(extras.taxCollected.USD).toBe(150);
      expect(extras.platformFeeCollected.USD).toBe(75);
      expect(extras.totalDiscountGiven.USD).toBe(20);
      expect(extras.couponRedemptionCount).toBe(1);
    });
  });
});

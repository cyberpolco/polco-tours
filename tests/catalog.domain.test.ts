import { describe, it, expect } from 'vitest';
import {
  effectivePrice,
  isBookable,
  isPackageVisible,
  isDepartureVisible,
  scorePackagesForQuiz,
} from '../src/modules/catalog/domain';
import type { TourPackageView, DepartureView } from '../src/modules/catalog/domain';

function pkg(overrides: Partial<TourPackageView> = {}): TourPackageView {
  return {
    id: 'pkg-1',
    organizationId: 'org-1',
    title: 'Etosha Safari',
    description: 'A safari.',
    country: 'NA',
    priceMinor: 10000,
    currency: 'USD',
    durationDays: 3,
    tags: [],
    status: 'PUBLISHED',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function departure(overrides: Partial<DepartureView> = {}): DepartureView {
  return {
    id: 'dep-1',
    organizationId: 'org-1',
    tourPackageId: 'pkg-1',
    startDate: new Date('2026-08-01'),
    endDate: new Date('2026-08-04'),
    capacity: 10,
    priceOverrideMinor: null,
    status: 'SCHEDULED',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('catalog domain', () => {
  describe('effectivePrice', () => {
    it('inherits the package price when there is no override', () => {
      expect(effectivePrice(pkg(), departure())).toEqual({ minor: 10000, currency: 'USD' });
    });

    it('uses the departure override when present', () => {
      const dep = departure({ priceOverrideMinor: 8000 });
      expect(effectivePrice(pkg(), dep)).toEqual({ minor: 8000, currency: 'USD' });
    });
  });

  describe('isBookable', () => {
    it('is true for a published package with a scheduled departure', () => {
      expect(isBookable(pkg(), departure())).toBe(true);
    });

    it('is false for a draft package', () => {
      expect(isBookable(pkg({ status: 'DRAFT' }), departure())).toBe(false);
    });

    it('is false for a cancelled departure', () => {
      expect(isBookable(pkg(), departure({ status: 'CANCELLED' }))).toBe(false);
    });
  });

  describe('isPackageVisible', () => {
    it('operators see draft packages', () => {
      expect(isPackageVisible(pkg({ status: 'DRAFT' }), 'TOUR_OPERATOR')).toBe(true);
      expect(isPackageVisible(pkg({ status: 'DRAFT' }), 'SUPERADMIN')).toBe(true);
    });

    it('tourists only see published packages', () => {
      expect(isPackageVisible(pkg({ status: 'DRAFT' }), 'TOURIST')).toBe(false);
      expect(isPackageVisible(pkg({ status: 'PUBLISHED' }), 'TOURIST')).toBe(true);
    });
  });

  describe('isDepartureVisible', () => {
    it('operators see cancelled departures', () => {
      expect(isDepartureVisible(departure({ status: 'CANCELLED' }), 'TOUR_OPERATOR')).toBe(true);
    });

    it('tourists only see scheduled departures', () => {
      expect(isDepartureVisible(departure({ status: 'CANCELLED' }), 'TOURIST')).toBe(false);
      expect(isDepartureVisible(departure({ status: 'SCHEDULED' }), 'TOURIST')).toBe(true);
    });
  });

  describe('scorePackagesForQuiz', () => {
    const wildlife = pkg({ id: 'p-wildlife', title: 'Etosha Safari', tags: ['WILDLIFE', 'ADVENTURE'], country: 'NA' });
    const relax = pkg({ id: 'p-relax', title: 'Namib Retreat', tags: ['RELAXATION'], country: 'NA', durationDays: 3 });
    const culture = pkg({ id: 'p-culture', title: 'Kinshasa Culture', tags: ['CULTURE', 'FAMILY'], country: 'CD', durationDays: 12 });

    it('filters by country when specified', () => {
      const results = scorePackagesForQuiz([wildlife, relax, culture], { country: 'CD' });
      expect(results.map((p) => p.id)).toEqual(['p-culture']);
    });

    it('filters by trip-length bucket, excluding packages with no durationDays set', () => {
      const noDuration = pkg({ id: 'p-none', durationDays: null });
      const results = scorePackagesForQuiz([wildlife, relax, noDuration], { tripLength: 'SHORT' });
      expect(results.map((p) => p.id)).toEqual(['p-wildlife', 'p-relax']);
    });

    it('excludes packages outside the chosen trip-length bucket', () => {
      const results = scorePackagesForQuiz([culture], { tripLength: 'SHORT' });
      expect(results).toHaveLength(0);
    });

    it('sorts by tag-overlap count descending', () => {
      const results = scorePackagesForQuiz([wildlife, relax, culture], { tags: ['WILDLIFE', 'ADVENTURE'] });
      expect(results[0]?.id).toBe('p-wildlife');
    });

    it('ties (including zero matches) break alphabetically by title, never by cross-currency price', () => {
      const results = scorePackagesForQuiz([wildlife, relax, culture], {});
      // No tag preference -> every package scores 0 -> pure alphabetical order.
      expect(results.map((p) => p.title)).toEqual(['Etosha Safari', 'Kinshasa Culture', 'Namib Retreat']);
    });

    it('returns everything, unranked-but-present, when answers are empty', () => {
      const results = scorePackagesForQuiz([wildlife, relax, culture], {});
      expect(results).toHaveLength(3);
    });

    it('scores a chosen site as a case-insensitive substring match against title/description (DR-024)', () => {
      const results = scorePackagesForQuiz([wildlife, relax, culture], { sites: ['etosha'] });
      expect(results[0]?.id).toBe('p-wildlife');
    });

    it('adds site score on top of tag score rather than replacing it', () => {
      const results = scorePackagesForQuiz([wildlife, relax, culture], {
        tags: ['CULTURE', 'FAMILY'],
        sites: ['Etosha National Park'],
      });
      // culture scores 2 from tags; wildlife scores 0 from tags + 0 from a
      // site that doesn't match its title ("Etosha Safari" has no "National
      // Park") -- so culture should still rank first here.
      expect(results[0]?.id).toBe('p-culture');
    });
  });
});

import { describe, it, expect } from 'vitest';
import {
  computeDepartureEndDate,
  effectivePrice,
  formatPackageReference,
  hasDepartureEnded,
  isBookable,
  isPackageVisible,
  isDepartureVisible,
  isPublishedStatus,
  CreatePackageInput,
  UpdatePackageInput,
} from '../src/modules/catalog/domain';
import type { TourPackageView, DepartureView } from '../src/modules/catalog/domain';

function pkg(overrides: Partial<TourPackageView> = {}): TourPackageView {
  return {
    id: 'pkg-1',
    organizationId: 'org-1',
    packageReference: 'PKG-00001',
    slug: 'etosha-safari',
    title: 'Etosha Safari',
    description: 'A safari.',
    country: 'NA',
    countries: ['NA'],
    priceMinor: 10000,
    priceSubtotalMinor: null,
    priceTaxRateBp: null,
    pricePlatformFeeRateBp: null,
    currency: 'USD',
    durationDays: 3,
    imageUrl: null,
    tags: [],
    status: 'PUBLISHED_AVAILABLE',
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
    currency: null,
    customCountry: null,
    pickupLatitude: null,
    pickupLongitude: null,
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
    it('is true for a published-available package with a scheduled departure', () => {
      expect(isBookable(pkg(), departure())).toBe(true);
    });

    it('is false for a draft package', () => {
      expect(isBookable(pkg({ status: 'DRAFT' }), departure())).toBe(false);
    });

    // DR-117: PUBLISHED_UNAVAILABLE is still listed to guests (isPackageVisible)
    // but never bookable -- distinct from DRAFT, which is hidden entirely.
    it('is false for a published-but-unavailable package', () => {
      expect(isBookable(pkg({ status: 'PUBLISHED_UNAVAILABLE' }), departure())).toBe(false);
    });

    it('is false for a cancelled departure', () => {
      expect(isBookable(pkg(), departure({ status: 'CANCELLED' }))).toBe(false);
    });
  });

  describe('isPackageVisible', () => {
    it('operators see draft packages', () => {
      expect(isPackageVisible(pkg({ status: 'DRAFT' }), ['TOUR_OPERATOR'])).toBe(true);
      expect(isPackageVisible(pkg({ status: 'DRAFT' }), ['SUPERADMIN'])).toBe(true);
    });

    it('tourists only see published packages', () => {
      expect(isPackageVisible(pkg({ status: 'DRAFT' }), ['TOURIST'])).toBe(false);
      expect(isPackageVisible(pkg({ status: 'PUBLISHED_AVAILABLE' }), ['TOURIST'])).toBe(true);
    });

    // DR-117: PUBLISHED_UNAVAILABLE stays listed to guests -- only bookability
    // (isBookable), not visibility, distinguishes it from PUBLISHED_AVAILABLE.
    it('tourists also see published-but-unavailable packages', () => {
      expect(isPackageVisible(pkg({ status: 'PUBLISHED_UNAVAILABLE' }), ['TOURIST'])).toBe(true);
    });
  });

  describe('isPublishedStatus (DR-117)', () => {
    it('is true for both published sub-statuses', () => {
      expect(isPublishedStatus('PUBLISHED_AVAILABLE')).toBe(true);
      expect(isPublishedStatus('PUBLISHED_UNAVAILABLE')).toBe(true);
    });

    it('is false for draft and archived', () => {
      expect(isPublishedStatus('DRAFT')).toBe(false);
      expect(isPublishedStatus('ARCHIVED')).toBe(false);
    });
  });

  describe('hasDepartureEnded (DR-106)', () => {
    const now = new Date('2026-08-14T00:00:00Z');

    it('is true once endDate is in the past', () => {
      expect(hasDepartureEnded(new Date('2026-08-13T00:00:00Z'), now)).toBe(true);
    });

    it('is false while endDate is still in the future', () => {
      expect(hasDepartureEnded(new Date('2026-08-15T00:00:00Z'), now)).toBe(false);
    });

    it('is false for a departure with no endDate at all', () => {
      expect(hasDepartureEnded(null, now)).toBe(false);
    });
  });

  describe('isDepartureVisible', () => {
    it('operators see cancelled departures', () => {
      expect(isDepartureVisible(departure({ status: 'CANCELLED' }), ['TOUR_OPERATOR'])).toBe(true);
    });

    it('tourists only see scheduled departures', () => {
      expect(isDepartureVisible(departure({ status: 'CANCELLED' }), ['TOURIST'])).toBe(false);
      expect(isDepartureVisible(departure({ status: 'SCHEDULED' }), ['TOURIST'])).toBe(true);
    });
  });

  // DR-054 (revised same session): trip length is staff-set (durationDays),
  // the guest only picks a start date -- this is the sole place that turns
  // "N days" into a calendar end date.
  describe('computeDepartureEndDate', () => {
    it('a 1-day trip ends on the same day it starts', () => {
      expect(computeDepartureEndDate(new Date('2027-03-01T00:00:00Z'), 1)).toEqual(new Date('2027-03-01T00:00:00Z'));
    });

    it('a 7-day trip spans 7 calendar days, start through start+6', () => {
      expect(computeDepartureEndDate(new Date('2027-03-01T00:00:00Z'), 7)).toEqual(new Date('2027-03-07T00:00:00Z'));
    });

    it('rolls over a month boundary correctly', () => {
      expect(computeDepartureEndDate(new Date('2027-01-28T00:00:00Z'), 5)).toEqual(new Date('2027-02-01T00:00:00Z'));
    });
  });

  describe('formatPackageReference', () => {
    it('formats as PKG-{5-digit zero-padded sequence}, no year (DR-028)', () => {
      expect(formatPackageReference(34)).toBe('PKG-00034');
    });

    it('does not truncate a sequence longer than 5 digits', () => {
      expect(formatPackageReference(123456)).toBe('PKG-123456');
    });

    it('accepts a bigint sequence (Postgres nextval())', () => {
      expect(formatPackageReference(7n)).toBe('PKG-00007');
    });
  });

  // DR-114: country/countries restricted to the 4 operating countries, and
  // countries must include the primary country -- same "client prevents for
  // UX, server still validates" precedent as itinerary/domain.ts's
  // CreateSiteInput country/province refine.
  describe('CreatePackageInput (DR-114)', () => {
    const base = {
      title: 'Combo Safari',
      description: 'A trip.',
      currency: 'USD' as const,
    };

    it('accepts a single-country package', () => {
      const result = CreatePackageInput.safeParse({ ...base, country: 'NA', countries: ['NA'] });
      expect(result.success).toBe(true);
    });

    it('accepts a combo package whose primary is included in countries', () => {
      const result = CreatePackageInput.safeParse({ ...base, country: 'ZM', countries: ['ZM', 'ZW'] });
      expect(result.success).toBe(true);
    });

    it('rejects a primary country missing from countries', () => {
      const result = CreatePackageInput.safeParse({ ...base, country: 'ZM', countries: ['ZW'] });
      expect(result.success).toBe(false);
    });

    it('rejects a country outside the 4 operating countries', () => {
      const result = CreatePackageInput.safeParse({ ...base, country: 'ZA', countries: ['ZA'] });
      expect(result.success).toBe(false);
    });

    it('rejects an empty countries array', () => {
      const result = CreatePackageInput.safeParse({ ...base, country: 'NA', countries: [] });
      expect(result.success).toBe(false);
    });
  });

  describe('UpdatePackageInput (DR-114)', () => {
    it('only enforces the country/countries cross-check when both are present in this particular update', () => {
      // Archiving a package (status-only update) never touches country --
      // must not spuriously fail the cross-field check.
      expect(UpdatePackageInput.safeParse({ status: 'ARCHIVED' }).success).toBe(true);
    });

    it('still rejects a primary country missing from countries when both are present', () => {
      const result = UpdatePackageInput.safeParse({ country: 'ZM', countries: ['ZW'] });
      expect(result.success).toBe(false);
    });

    it('accepts a valid combo update', () => {
      const result = UpdatePackageInput.safeParse({ country: 'ZM', countries: ['ZM', 'ZW'] });
      expect(result.success).toBe(true);
    });
  });
});

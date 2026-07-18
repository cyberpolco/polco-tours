import { describe, it, expect } from 'vitest';
import { effectivePrice, formatPackageReference, isBookable, isPackageVisible, isDepartureVisible } from '../src/modules/catalog/domain';
import type { TourPackageView, DepartureView } from '../src/modules/catalog/domain';

function pkg(overrides: Partial<TourPackageView> = {}): TourPackageView {
  return {
    id: 'pkg-1',
    organizationId: 'org-1',
    packageReference: 'PKG-00001',
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
      expect(isPackageVisible(pkg({ status: 'DRAFT' }), ['TOUR_OPERATOR'])).toBe(true);
      expect(isPackageVisible(pkg({ status: 'DRAFT' }), ['SUPERADMIN'])).toBe(true);
    });

    it('tourists only see published packages', () => {
      expect(isPackageVisible(pkg({ status: 'DRAFT' }), ['TOURIST'])).toBe(false);
      expect(isPackageVisible(pkg({ status: 'PUBLISHED' }), ['TOURIST'])).toBe(true);
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
});

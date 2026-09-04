import { describe, it, expect } from 'vitest';
import {
  complianceStatus,
  computeAvailabilityStatus,
  isFleetDeleter,
  isWithinPostTourCooldown,
  maintenanceRecencyScore,
  POST_TOUR_AVAILABILITY_DELAY_HOURS,
  CreateDriverProfileInput,
  CreateGuideProfileInput,
  CreateVehicleInput,
  UpdateGuideProfileInput,
  UpdateVehicleInput,
} from '../src/modules/fleet/domain';

describe('fleet domain', () => {
  describe('complianceStatus', () => {
    const now = new Date('2026-07-10T00:00:00Z');

    it('is MISSING when there is no expiry date on file', () => {
      expect(complianceStatus(null, now)).toBe('MISSING');
    });

    it('is EXPIRED when the expiry date is in the past', () => {
      expect(complianceStatus(new Date('2026-07-09T00:00:00Z'), now)).toBe('EXPIRED');
    });

    it('is EXPIRED exactly at the boundary (expires "now" counts as expired)', () => {
      expect(complianceStatus(new Date('2026-07-10T00:00:00Z'), now)).toBe('EXPIRED');
    });

    it('is EXPIRING_SOON within the 30-day window', () => {
      expect(complianceStatus(new Date('2026-07-25T00:00:00Z'), now)).toBe('EXPIRING_SOON');
    });

    it('is EXPIRING_SOON exactly at the 30-day boundary', () => {
      expect(complianceStatus(new Date('2026-08-09T00:00:00Z'), now)).toBe('EXPIRING_SOON');
    });

    it('is VALID just past the 30-day window', () => {
      expect(complianceStatus(new Date('2026-08-10T00:00:01Z'), now)).toBe('VALID');
    });

    it('is VALID for a far-future expiry', () => {
      expect(complianceStatus(new Date('2030-01-01T00:00:00Z'), now)).toBe('VALID');
    });
  });

  describe('CreateVehicleInput', () => {
    it('accepts a valid vehicle', () => {
      const result = CreateVehicleInput.safeParse({
        plateNumber: 'N123-ABC',
        make: 'Toyota',
        model: 'Land Cruiser',
        vehicleType: '4x4',
        seatCapacity: 7,
      });
      expect(result.success).toBe(true);
    });

    it('rejects a non-positive seat capacity', () => {
      const result = CreateVehicleInput.safeParse({
        plateNumber: 'N123-ABC',
        make: 'Toyota',
        model: 'Land Cruiser',
        vehicleType: '4x4',
        seatCapacity: 0,
      });
      expect(result.success).toBe(false);
    });

    it('rejects a missing required field', () => {
      const result = CreateVehicleInput.safeParse({
        make: 'Toyota',
        model: 'Land Cruiser',
        vehicleType: '4x4',
        seatCapacity: 7,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('UpdateVehicleInput', () => {
    it('allows a partial update with just status', () => {
      const result = UpdateVehicleInput.safeParse({ status: 'MAINTENANCE' });
      expect(result.success).toBe(true);
    });

    it('rejects an invalid status value', () => {
      const result = UpdateVehicleInput.safeParse({ status: 'DESTROYED' });
      expect(result.success).toBe(false);
    });
  });

  describe('CreateDriverProfileInput', () => {
    it('accepts a valid driver profile', () => {
      const result = CreateDriverProfileInput.safeParse({
        userId: '11111111-1111-4111-8111-111111111111',
        licenseNumber: 'DL-001',
      });
      expect(result.success).toBe(true);
    });

    it('rejects a non-uuid userId', () => {
      const result = CreateDriverProfileInput.safeParse({ userId: 'not-a-uuid', licenseNumber: 'DL-001' });
      expect(result.success).toBe(false);
    });

    // DR-246: languages now draws from a fixed LANGUAGE_CODES list instead
    // of a freeform ISO-639-1-length(2) check -- accepts a 3-letter code
    // from that list (e.g. "bem", Bemba, which has no real 2-letter
    // ISO 639-1 code) and rejects anything not on the list at all.
    it('accepts a valid fixed-list language, including a 3-letter one', () => {
      const result = CreateDriverProfileInput.safeParse({
        userId: '11111111-1111-4111-8111-111111111111',
        licenseNumber: 'DL-001',
        languages: ['en', 'bem'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects a language not on the fixed list', () => {
      const result = CreateDriverProfileInput.safeParse({
        userId: '11111111-1111-4111-8111-111111111111',
        licenseNumber: 'DL-001',
        languages: ['klingon'],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('CreateGuideProfileInput (DR-030)', () => {
    it('accepts a valid guide profile with languages and specialties', () => {
      const result = CreateGuideProfileInput.safeParse({
        userId: '11111111-1111-4111-8111-111111111111',
        languages: ['en', 'fr'],
        specialties: ['WILDLIFE', 'ADVENTURE'],
      });
      expect(result.success).toBe(true);
    });

    // DR-245: specialties now draws from the same PackageTag enum
    // TourPackage.tags uses, not a freeform string -- an old-style
    // freeform value like the pre-DR-245 "gorilla trekking" is rejected.
    it('rejects a specialty that is not a real PackageTag value', () => {
      const result = CreateGuideProfileInput.safeParse({
        userId: '11111111-1111-4111-8111-111111111111',
        specialties: ['gorilla trekking'],
      });
      expect(result.success).toBe(false);
    });

    it('accepts a guide profile with neither languages nor specialties', () => {
      const result = CreateGuideProfileInput.safeParse({
        userId: '11111111-1111-4111-8111-111111111111',
      });
      expect(result.success).toBe(true);
    });

    it('rejects a non-uuid userId', () => {
      const result = CreateGuideProfileInput.safeParse({ userId: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });
  });

  describe('UpdateGuideProfileInput (DR-030)', () => {
    it('allows a partial update with just status', () => {
      const result = UpdateGuideProfileInput.safeParse({ status: 'SUSPENDED' });
      expect(result.success).toBe(true);
    });

    it('rejects an invalid status value', () => {
      const result = UpdateGuideProfileInput.safeParse({ status: 'RETIRED' });
      expect(result.success).toBe(false);
    });
  });

  describe('maintenanceRecencyScore (DR-029)', () => {
    const now = new Date('2026-07-10T00:00:00Z');

    it('is a neutral 0.5 with no logged history -- not a penalty', () => {
      expect(maintenanceRecencyScore(null, now)).toBe(0.5);
    });

    it('is 1 for maintenance performed right now', () => {
      expect(maintenanceRecencyScore(now, now)).toBe(1);
    });

    it('decreases the longer ago maintenance was performed', () => {
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      expect(maintenanceRecencyScore(ninetyDaysAgo, now)).toBeCloseTo(0.5, 5);
    });

    it('floors at 0 for maintenance long past the lookback window', () => {
      const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      expect(maintenanceRecencyScore(yearAgo, now)).toBe(0);
    });
  });

  describe('computeAvailabilityStatus (DR-082)', () => {
    const now = new Date('2026-07-10T00:00:00Z');

    it('is BOOKED whenever isCurrentlyBooked is true, regardless of lastActiveAt', () => {
      expect(computeAvailabilityStatus(true, now, now)).toBe('BOOKED');
      const longAgo = new Date('2020-01-01T00:00:00Z');
      expect(computeAvailabilityStatus(true, longAgo, now)).toBe('BOOKED');
    });

    it('is AVAILABLE when not currently booked and lastActiveAt is recent', () => {
      expect(computeAvailabilityStatus(false, now, now)).toBe('AVAILABLE');
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      expect(computeAvailabilityStatus(false, thirtyDaysAgo, now)).toBe('AVAILABLE');
    });

    it('is AVAILABLE exactly at the 60-day boundary', () => {
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      expect(computeAvailabilityStatus(false, sixtyDaysAgo, now)).toBe('AVAILABLE');
    });

    it('is INACTIVE just past the 60-day boundary', () => {
      const justOver = new Date(now.getTime() - 61 * 24 * 60 * 60 * 1000);
      expect(computeAvailabilityStatus(false, justOver, now)).toBe('INACTIVE');
    });

    it('is INACTIVE for a resource inactive for a year', () => {
      const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      expect(computeAvailabilityStatus(false, yearAgo, now)).toBe('INACTIVE');
    });
  });

  describe('isWithinPostTourCooldown (DR-107)', () => {
    const now = new Date('2026-08-14T12:00:00Z');

    it('is false for a departure with no endDate', () => {
      expect(isWithinPostTourCooldown(null, now)).toBe(false);
    });

    it('is true the instant a departure ends', () => {
      expect(isWithinPostTourCooldown(now, now)).toBe(true);
    });

    // DR-242: window shortened from 24h to 2h -- expressed via
    // POST_TOUR_AVAILABILITY_DELAY_HOURS rather than a hardcoded number so
    // this test doesn't go stale silently on a future change to that
    // constant (the exact failure mode that made this test fail against
    // this DR's own 24h -> 2h change).
    it('is true partway through the cooldown window', () => {
      const partway = new Date(now.getTime() - (POST_TOUR_AVAILABILITY_DELAY_HOURS / 2) * 60 * 60 * 1000);
      expect(isWithinPostTourCooldown(partway, now)).toBe(true);
    });

    it('is false once the cooldown window has fully elapsed', () => {
      const fullyElapsed = new Date(now.getTime() - POST_TOUR_AVAILABILITY_DELAY_HOURS * 60 * 60 * 1000);
      expect(isWithinPostTourCooldown(fullyElapsed, now)).toBe(false);
    });

    it('is false for a departure that has not ended yet', () => {
      const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
      expect(isWithinPostTourCooldown(inOneHour, now)).toBe(false);
    });
  });

  // DR-059: hard-to-reverse, SUPERADMIN-only fleet deletion.
  describe('isFleetDeleter', () => {
    it('is true only for SUPERADMIN', () => {
      expect(isFleetDeleter(['SUPERADMIN'])).toBe(true);
    });

    it('is false for every other role, including PLATFORM_ADMIN/TOUR_OPERATOR', () => {
      expect(isFleetDeleter(['PLATFORM_ADMIN'])).toBe(false);
      expect(isFleetDeleter(['TOUR_OPERATOR'])).toBe(false);
      expect(isFleetDeleter(['VEHICLE_OWNER'])).toBe(false);
      expect(isFleetDeleter([])).toBe(false);
    });

    it('is true if SUPERADMIN is any one of several held roles', () => {
      expect(isFleetDeleter(['TOUR_OPERATOR', 'SUPERADMIN'])).toBe(true);
    });
  });
});

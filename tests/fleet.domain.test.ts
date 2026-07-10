import { describe, it, expect } from 'vitest';
import {
  complianceStatus,
  CreateDriverProfileInput,
  CreateVehicleInput,
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
  });
});

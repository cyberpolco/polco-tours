import { describe, it, expect } from 'vitest';
import { departuresOverlap, CreateAssignmentInput } from '../src/modules/assignment/domain';

describe('assignment domain', () => {
  describe('departuresOverlap', () => {
    it('is true for two same-day departures (no endDate) on the same date', () => {
      const a = { startDate: new Date('2026-09-01T00:00:00Z'), endDate: null };
      const b = { startDate: new Date('2026-09-01T00:00:00Z'), endDate: null };
      expect(departuresOverlap(a, b)).toBe(true);
    });

    it('is false for two same-day departures (no endDate) on different dates', () => {
      const a = { startDate: new Date('2026-09-01T00:00:00Z'), endDate: null };
      const b = { startDate: new Date('2026-09-05T00:00:00Z'), endDate: null };
      expect(departuresOverlap(a, b)).toBe(false);
    });

    it('is true when one range is fully contained in the other', () => {
      const a = { startDate: new Date('2026-09-01T00:00:00Z'), endDate: new Date('2026-09-10T00:00:00Z') };
      const b = { startDate: new Date('2026-09-03T00:00:00Z'), endDate: new Date('2026-09-05T00:00:00Z') };
      expect(departuresOverlap(a, b)).toBe(true);
    });

    it('is false for disjoint ranges', () => {
      const a = { startDate: new Date('2026-09-01T00:00:00Z'), endDate: new Date('2026-09-05T00:00:00Z') };
      const b = { startDate: new Date('2026-09-10T00:00:00Z'), endDate: new Date('2026-09-15T00:00:00Z') };
      expect(departuresOverlap(a, b)).toBe(false);
    });

    it('is true exactly at the boundary (a ends when b starts, inclusive)', () => {
      const a = { startDate: new Date('2026-09-01T00:00:00Z'), endDate: new Date('2026-09-05T00:00:00Z') };
      const b = { startDate: new Date('2026-09-05T00:00:00Z'), endDate: new Date('2026-09-10T00:00:00Z') };
      expect(departuresOverlap(a, b)).toBe(true);
    });

    it('is false just past the boundary', () => {
      const a = { startDate: new Date('2026-09-01T00:00:00Z'), endDate: new Date('2026-09-05T00:00:00Z') };
      const b = { startDate: new Date('2026-09-05T00:00:00.001Z'), endDate: new Date('2026-09-10T00:00:00Z') };
      expect(departuresOverlap(a, b)).toBe(false);
    });

    it('is symmetric', () => {
      const a = { startDate: new Date('2026-09-01T00:00:00Z'), endDate: new Date('2026-09-05T00:00:00Z') };
      const b = { startDate: new Date('2026-09-10T00:00:00Z'), endDate: new Date('2026-09-15T00:00:00Z') };
      expect(departuresOverlap(a, b)).toBe(departuresOverlap(b, a));
    });
  });

  describe('CreateAssignmentInput', () => {
    it('accepts vehicleId + driverProfileId with no guide', () => {
      const result = CreateAssignmentInput.safeParse({
        vehicleId: '11111111-1111-4111-8111-111111111111',
        driverProfileId: '22222222-2222-4222-8222-222222222222',
      });
      expect(result.success).toBe(true);
    });

    it('accepts an optional guideUserId', () => {
      const result = CreateAssignmentInput.safeParse({
        vehicleId: '11111111-1111-4111-8111-111111111111',
        driverProfileId: '22222222-2222-4222-8222-222222222222',
        guideUserId: '33333333-3333-4333-8333-333333333333',
      });
      expect(result.success).toBe(true);
    });

    it('rejects a missing vehicleId', () => {
      const result = CreateAssignmentInput.safeParse({
        driverProfileId: '22222222-2222-4222-8222-222222222222',
      });
      expect(result.success).toBe(false);
    });

    it('rejects a non-uuid guideUserId', () => {
      const result = CreateAssignmentInput.safeParse({
        vehicleId: '11111111-1111-4111-8111-111111111111',
        driverProfileId: '22222222-2222-4222-8222-222222222222',
        guideUserId: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { canDecide, DecideVisaInput } from '../src/modules/visa/domain';

describe('visa domain', () => {
  describe('canDecide', () => {
    it('is true for SUBMITTED', () => {
      expect(canDecide('SUBMITTED')).toBe(true);
    });

    it('is false for APPROVED (already decided)', () => {
      expect(canDecide('APPROVED')).toBe(false);
    });

    it('is false for REJECTED (already decided, no resubmission this increment)', () => {
      expect(canDecide('REJECTED')).toBe(false);
    });
  });

  describe('DecideVisaInput', () => {
    it('accepts APPROVED', () => {
      expect(DecideVisaInput.safeParse({ outcome: 'APPROVED' }).success).toBe(true);
    });

    it('accepts REJECTED', () => {
      expect(DecideVisaInput.safeParse({ outcome: 'REJECTED' }).success).toBe(true);
    });

    it('rejects SUBMITTED (not a valid decision outcome)', () => {
      expect(DecideVisaInput.safeParse({ outcome: 'SUBMITTED' }).success).toBe(false);
    });

    it('rejects a missing outcome', () => {
      expect(DecideVisaInput.safeParse({}).success).toBe(false);
    });
  });
});

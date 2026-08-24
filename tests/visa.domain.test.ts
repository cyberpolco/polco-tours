import { describe, it, expect } from 'vitest';
import { canDecide, canMarkFeePaid, canRequestFeePayment, canResubmit, DecideVisaInput } from '../src/modules/visa/domain';

describe('visa domain', () => {
  describe('canDecide', () => {
    it('is true for SUBMITTED', () => {
      expect(canDecide('SUBMITTED')).toBe(true);
    });

    it('is false for APPROVED (already decided)', () => {
      expect(canDecide('APPROVED')).toBe(false);
    });

    it('is false for REJECTED (must resubmit first, not decide directly)', () => {
      expect(canDecide('REJECTED')).toBe(false);
    });
  });

  describe('canResubmit', () => {
    it('is true for REJECTED', () => {
      expect(canResubmit('REJECTED')).toBe(true);
    });

    it('is false for SUBMITTED', () => {
      expect(canResubmit('SUBMITTED')).toBe(false);
    });

    it('is false for APPROVED', () => {
      expect(canResubmit('APPROVED')).toBe(false);
    });
  });

  describe('DecideVisaInput', () => {
    it('accepts APPROVED', () => {
      expect(DecideVisaInput.safeParse({ outcome: 'APPROVED' }).success).toBe(true);
    });

    it('accepts REJECTED', () => {
      expect(DecideVisaInput.safeParse({ outcome: 'REJECTED' }).success).toBe(true);
    });

    it('accepts REJECTED with a reason', () => {
      expect(DecideVisaInput.safeParse({ outcome: 'REJECTED', reason: 'passport photo unreadable' }).success).toBe(true);
    });

    it('accepts an omitted reason', () => {
      const parsed = DecideVisaInput.safeParse({ outcome: 'APPROVED' });
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data.reason).toBeUndefined();
    });

    it('rejects a reason over 500 characters', () => {
      expect(DecideVisaInput.safeParse({ outcome: 'REJECTED', reason: 'x'.repeat(501) }).success).toBe(false);
    });

    it('rejects SUBMITTED (not a valid decision outcome)', () => {
      expect(DecideVisaInput.safeParse({ outcome: 'SUBMITTED' }).success).toBe(false);
    });

    it('rejects a missing outcome', () => {
      expect(DecideVisaInput.safeParse({}).success).toBe(false);
    });
  });

  // DR-184
  describe('canRequestFeePayment', () => {
    it('is true for NOT_REQUESTED', () => {
      expect(canRequestFeePayment('NOT_REQUESTED')).toBe(true);
    });

    it('is false for REQUESTED (already requested)', () => {
      expect(canRequestFeePayment('REQUESTED')).toBe(false);
    });

    it('is false for PAID', () => {
      expect(canRequestFeePayment('PAID')).toBe(false);
    });
  });

  describe('canMarkFeePaid', () => {
    it('is true for REQUESTED', () => {
      expect(canMarkFeePaid('REQUESTED')).toBe(true);
    });

    it('is false for NOT_REQUESTED (must be requested first)', () => {
      expect(canMarkFeePaid('NOT_REQUESTED')).toBe(false);
    });

    it('is false for PAID (terminal)', () => {
      expect(canMarkFeePaid('PAID')).toBe(false);
    });
  });
});

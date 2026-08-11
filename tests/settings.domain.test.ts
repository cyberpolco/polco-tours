import { describe, it, expect } from 'vitest';
import { CreateCouponInput, CreatePlatformRateInput, CreateTaxRateInput, generateCouponCode } from '../src/modules/settings/domain';

describe('settings domain', () => {
  describe('CreateTaxRateInput', () => {
    it('accepts a valid input, defaulting taxType to undefined when omitted', () => {
      const result = CreateTaxRateInput.parse({ country: 'NA', rateBp: 1500 });
      expect(result.country).toBe('NA');
      expect(result.rateBp).toBe(1500);
      expect(result.taxType).toBeUndefined();
    });

    it('accepts an explicit taxType', () => {
      const result = CreateTaxRateInput.parse({ country: 'CD', taxType: 'VAT', rateBp: 1600 });
      expect(result.taxType).toBe('VAT');
    });

    it('rejects a country code that is not exactly 2 characters', () => {
      expect(() => CreateTaxRateInput.parse({ country: 'NAM', rateBp: 1500 })).toThrow();
      expect(() => CreateTaxRateInput.parse({ country: 'N', rateBp: 1500 })).toThrow();
    });

    it('rejects a negative or non-integer rateBp', () => {
      expect(() => CreateTaxRateInput.parse({ country: 'NA', rateBp: -100 })).toThrow();
      expect(() => CreateTaxRateInput.parse({ country: 'NA', rateBp: 15.5 })).toThrow();
    });
  });

  describe('CreatePlatformRateInput', () => {
    it('accepts a valid input with no country dimension', () => {
      const result = CreatePlatformRateInput.parse({ rateBp: 500 });
      expect(result.rateBp).toBe(500);
    });

    it('rejects a negative or non-integer rateBp', () => {
      expect(() => CreatePlatformRateInput.parse({ rateBp: -1 })).toThrow();
      expect(() => CreatePlatformRateInput.parse({ rateBp: 5.5 })).toThrow();
    });

    it('accepts optional effective-dating fields', () => {
      const result = CreatePlatformRateInput.parse({ rateBp: 500, validFrom: '2026-01-01', validTo: '2026-12-31' });
      expect(result.validFrom).toBeInstanceOf(Date);
      expect(result.validTo).toBeInstanceOf(Date);
    });
  });

  describe('CreateCouponInput', () => {
    it('accepts a minimal valid input, defaulting maxRedemptions/expiresAt to undefined', () => {
      const result = CreateCouponInput.parse({ discountBp: 1000 });
      expect(result.discountBp).toBe(1000);
      expect(result.maxRedemptions).toBeUndefined();
      expect(result.expiresAt).toBeUndefined();
    });

    it('accepts the full range including the 50% cap boundary', () => {
      expect(CreateCouponInput.parse({ discountBp: 1 }).discountBp).toBe(1);
      expect(CreateCouponInput.parse({ discountBp: 5000 }).discountBp).toBe(5000);
    });

    it('rejects discountBp of 0, above the 50% cap, or non-integer', () => {
      expect(() => CreateCouponInput.parse({ discountBp: 0 })).toThrow();
      expect(() => CreateCouponInput.parse({ discountBp: 5001 })).toThrow();
      expect(() => CreateCouponInput.parse({ discountBp: 15.5 })).toThrow();
    });

    it('accepts optional maxRedemptions and expiresAt', () => {
      const result = CreateCouponInput.parse({ discountBp: 1000, maxRedemptions: 5, expiresAt: '2026-12-31' });
      expect(result.maxRedemptions).toBe(5);
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('rejects a non-positive or non-integer maxRedemptions', () => {
      expect(() => CreateCouponInput.parse({ discountBp: 1000, maxRedemptions: 0 })).toThrow();
      expect(() => CreateCouponInput.parse({ discountBp: 1000, maxRedemptions: -1 })).toThrow();
      expect(() => CreateCouponInput.parse({ discountBp: 1000, maxRedemptions: 1.5 })).toThrow();
    });
  });

  describe('generateCouponCode', () => {
    it('matches the exact CPC-{YY}-{6 digits}-{2 letters} format', () => {
      const code = generateCouponCode(new Date('2026-03-01'));
      expect(code).toMatch(/^CPC-\d{2}-\d{6}-[A-Z]{2}$/);
    });

    it('uses the year mod 100 of the date passed in', () => {
      // Constructed in local time (not a UTC-midnight ISO string) so this
      // isn't sensitive to the test runner's timezone near a year boundary.
      expect(generateCouponCode(new Date(2026, 5, 15)).slice(4, 6)).toBe('26');
      expect(generateCouponCode(new Date(2027, 5, 15)).slice(4, 6)).toBe('27');
    });

    it('never contains the digit 3 in the 6-digit segment, across many calls', () => {
      for (let i = 0; i < 200; i++) {
        const digits = generateCouponCode().split('-')[2];
        expect(digits).not.toContain('3');
      }
    });

    it('never produces the forbidden letter pair "AK", across many calls', () => {
      for (let i = 0; i < 200; i++) {
        const letters = generateCouponCode().split('-')[3];
        expect(letters).not.toBe('AK');
      }
    });

    it('produces distinct codes across many calls', () => {
      const codes = new Set(Array.from({ length: 200 }, () => generateCouponCode()));
      expect(codes.size).toBe(200);
    });
  });
});

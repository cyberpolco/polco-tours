import { describe, it, expect } from 'vitest';
import { CreatePlatformRateInput, CreateTaxRateInput } from '../src/modules/settings/domain';

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
});

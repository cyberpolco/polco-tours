import { describe, it, expect } from 'vitest';
import { money, add, taxOf, format, scale } from '../src/lib/money';

describe('money (minor units, per-country tax)', () => {
  it('adds same-currency amounts', () => {
    expect(add(money(1050, 'USD'), money(200, 'USD')).minor).toBe(1250);
  });

  it('rejects currency mismatch', () => {
    expect(() => add(money(100, 'USD'), money(100, 'NAD'))).toThrow();
  });

  it('computes DRC VAT 16% (1600 bp)', () => {
    expect(taxOf(money(10000, 'CDF'), 1600).minor).toBe(1600);
  });

  it('computes Namibia VAT 15% (1500 bp) with half-up rounding', () => {
    expect(taxOf(money(999, 'NAD'), 1500).minor).toBe(150); // 149.85 -> 150
  });

  it('formats to currency', () => {
    expect(format(money(1050, 'USD'))).toContain('10.50');
  });

  it('scales a unit price by seat count', () => {
    expect(scale(money(1000, 'USD'), 3)).toEqual({ minor: 3000, currency: 'USD' });
  });

  it('scale rejects non-integer or negative factors', () => {
    expect(() => scale(money(1000, 'USD'), 1.5)).toThrow();
    expect(() => scale(money(1000, 'USD'), -1)).toThrow();
  });
});

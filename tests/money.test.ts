import { describe, it, expect } from 'vitest';
import { money, add, taxOf, format } from '../src/lib/money';

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
});

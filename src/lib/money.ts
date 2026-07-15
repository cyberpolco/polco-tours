/**
 * Money is stored and computed in integer minor units with an ISO-4217 code
 * (BR-02). Never use floats for money. FX rate is snapshotted per transaction
 * elsewhere; this module only does minor-unit arithmetic and formatting.
 */
export type Currency = 'USD' | 'EUR' | 'NAD' | 'CDF';

export interface Money {
  minor: number; // e.g. 1050 = 10.50
  currency: Currency;
}

const DECIMALS: Record<Currency, number> = { USD: 2, EUR: 2, NAD: 2, CDF: 2 };

export function money(minor: number, currency: Currency): Money {
  if (!Number.isInteger(minor)) throw new Error('Money.minor must be an integer');
  return { minor, currency };
}

export function add(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new Error('Currency mismatch');
  return { minor: a.minor + b.minor, currency: a.currency };
}

/** Multiply a unit price by an integer quantity (e.g. seats). */
export function scale(m: Money, factor: number): Money {
  if (!Number.isInteger(factor) || factor < 0) {
    throw new Error('Money.scale factor must be a non-negative integer');
  }
  return { minor: m.minor * factor, currency: m.currency };
}

/** Apply a tax rate given in basis points (1600 = 16%), rounding half-up. */
export function taxOf(base: Money, rateBp: number): Money {
  const tax = Math.round((base.minor * rateBp) / 10000);
  return { minor: tax, currency: base.currency };
}

export function format(m: Money, locale = 'en'): string {
  const d = DECIMALS[m.currency];
  const value = m.minor / 10 ** d;
  return new Intl.NumberFormat(locale, { style: 'currency', currency: m.currency }).format(value);
}

/** A TAILOR_MADE booking has no price until staff sends a quotation --
 * `Booking.priceMinor`/`currency` are null until then. UI call sites that
 * used to assume a booking always has a price now go through this instead
 * of `format(money(...))` directly. */
export function formatOrPending(minor: number | null, currency: Currency | null, pendingLabel = 'Awaiting quotation'): string {
  return minor != null && currency != null ? format(money(minor, currency)) : pendingLabel;
}

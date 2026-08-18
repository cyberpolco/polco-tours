// settings module — domain types & rules. Pure; no framework or DB imports.
// Settings Module (DR-042) -- closes DR-035's parked "Configure system
// settings" item. Owns TaxRate (existed since Phase 0, no CRUD/UI until now)
// and PlatformRate (new: the platform's own commission on every online
// payment). Both are platform-wide, effective-dated reference data, no
// organizationId/RLS -- same precedent as CountryRegulation/RolePermission.
import { z } from 'zod';

const EFFECTIVE_DATING = {
  validFrom: z.coerce.date().optional(),
  validTo: z.coerce.date().optional(),
};

export interface TaxRateView {
  id: string;
  country: string;
  taxType: string;
  rateBp: number;
  validFrom: Date;
  validTo: Date | null;
}

export const CreateTaxRateInput = z.object({
  country: z.string().length(2),
  taxType: z.string().min(1).max(50).optional(),
  rateBp: z.number().int().nonnegative(),
  ...EFFECTIVE_DATING,
});
export type CreateTaxRateInput = z.infer<typeof CreateTaxRateInput>;

export interface PlatformRateView {
  id: string;
  rateBp: number;
  validFrom: Date;
  validTo: Date | null;
}

export const CreatePlatformRateInput = z.object({
  rateBp: z.number().int().nonnegative(),
  ...EFFECTIVE_DATING,
});
export type CreatePlatformRateInput = z.infer<typeof CreatePlatformRateInput>;

// -------------------------------------------------------------- Coupon
// DR-104: a percentage-discount code, platform-wide like TaxRate/
// PlatformRate above. code is system-generated (generateCouponCode below),
// never staff-typed -- CreateCouponInput deliberately has no code field.

export interface CouponView {
  id: string;
  code: string;
  discountBp: number;
  maxRedemptions: number | null;
  expiresAt: Date | null;
  redemptionCount: number;
  createdAt: Date;
}

export const CreateCouponInput = z.object({
  discountBp: z.number().int().min(1).max(5000), // 0.01%..50%, hard-capped per business rule
  maxRedemptions: z.number().int().positive().optional(),
  expiresAt: z.coerce.date().optional(),
});
export type CreateCouponInput = z.infer<typeof CreateCouponInput>;

// DR-144: reused for updates too (full replace of every field except
// identity via the URL id, same precedent as finance/domain.ts's
// updateXRate schemas) -- an omitted maxRedemptions/expiresAt on an update
// clears that field back to unlimited/never-expires rather than leaving
// the previous value untouched, so the edit form's blank state means
// exactly what it looks like.
export const UpdateCouponInput = CreateCouponInput;
export type UpdateCouponInput = CreateCouponInput;

// Exact format specified by the business: CPC-{YY}-{NNNNNN}-{LL}, e.g.
// CPC-26-019654-HK. CPC is a fixed literal; YY is the current year mod 100
// at generation time (never staff-chosen); the 6-digit segment never
// contains the digit '3'; the 2-letter segment is never exactly "AK".
const COUPON_PREFIX = 'CPC';
const COUPON_DIGITS = '012456789'; // excludes '3' entirely
const COUPON_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const FORBIDDEN_LETTER_PAIR = 'AK';

// Rejection sampling against crypto.getRandomValues -- same "avoid modulo
// bias" rigor as booking/domain.ts's generateBookingReference (not the
// smaller accepted-bias approach ratings/domain.ts's generateRatingCode
// uses), needed here because the exclusion constraints must be exact.
function randomChars(alphabet: string, length: number): string {
  const max = Math.floor(256 / alphabet.length) * alphabet.length;
  const byte = new Uint8Array(1);
  const out: string[] = [];
  while (out.length < length) {
    crypto.getRandomValues(byte);
    const value = byte[0]!; // byte is a fixed-length-1 Uint8Array, always populated
    if (value >= max) continue; // reject -- would bias the distribution
    out.push(alphabet[value % alphabet.length]!); // % alphabet.length is always a valid index
  }
  return out.join('');
}

export function generateCouponCode(at: Date = new Date()): string {
  const yy = String(at.getFullYear() % 100).padStart(2, '0');
  const digits = randomChars(COUPON_DIGITS, 6);
  let letters = randomChars(COUPON_LETTERS, 2);
  while (letters === FORBIDDEN_LETTER_PAIR) letters = randomChars(COUPON_LETTERS, 2);
  return `${COUPON_PREFIX}-${yy}-${digits}-${letters}`;
}

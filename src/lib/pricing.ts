// DR-134: shared pure helper for folding tax + a platform fee onto a
// tax/fee-exclusive subtotal. Deliberately NOT wired into invoicing's own
// computeInvoiceAmounts (invoicing/domain.ts) -- that function stays exactly
// as-is so this addition carries zero risk of regressing the existing,
// tested invoicing/coupon formula. Kept here (not finance/domain.ts) since
// it has no dependency on finance's own types and is a general "apply tax +
// fee" primitive, same tier as money.ts's taxOf.
import { money, taxOf, type Currency } from './money';

export interface TaxAndFeeComponents {
  taxMinor: number;
  platformFeeMinor: number;
  totalMinor: number;
}

/** subtotal -> tax (on subtotal) -> platform fee (on subtotal + tax) ->
 * total. Same ordering as invoicing's computeInvoiceAmounts, no discount
 * step (nothing upstream of a package's own cost breakdown has a coupon to
 * apply). */
export function applyTaxAndPlatformFee(subtotalMinor: number, currency: Currency, taxRateBp: number, platformFeeRateBp: number): TaxAndFeeComponents {
  const subtotal = money(subtotalMinor, currency);
  const tax = taxOf(subtotal, taxRateBp);
  const preFeeTotal = money(subtotal.minor + tax.minor, currency);
  const platformFee = taxOf(preFeeTotal, platformFeeRateBp);
  return { taxMinor: tax.minor, platformFeeMinor: platformFee.minor, totalMinor: preFeeTotal.minor + platformFee.minor };
}

/** Inverse of applyTaxAndPlatformFee's total -- given a final tax+fee
 * inclusive price (e.g. a staff override) and the rates that produced it,
 * backs out the implied tax-exclusive subtotal so the two stay internally
 * consistent (subtotal run back through applyTaxAndPlatformFee reconstructs
 * very close to, generally exactly, totalMinor -- may be off by a cent from
 * integer rounding, same class of rounding computeInvoiceAmounts already
 * tolerates). */
export function impliedSubtotalMinor(totalMinor: number, taxRateBp: number, platformFeeRateBp: number): number {
  const divisor = (1 + taxRateBp / 10000) * (1 + platformFeeRateBp / 10000);
  return Math.round(totalMinor / divisor);
}

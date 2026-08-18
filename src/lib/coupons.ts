import { prisma } from './db';

/**
 * Coupon validation (DR-104). `Coupon` is platform-wide reference data (no
 * organizationId, no RLS policy) -- same precedent as TaxRate/PlatformRate
 * (src/lib/tax.ts / platform-rate.ts). This file exists so `invoicing`
 * never needs to import `@modules/settings` directly (module dependency
 * direction rule) -- it's the read-only window invoicing looks through
 * instead.
 */
// DR-144: INACTIVE was retired along with Coupon.deactivatedAt -- a coupon
// that's been turned off is now deleted outright (settingsService
// .deleteCoupon), so NOT_FOUND already covers "this code no longer works"
// with no separate reason needed.
export type CouponUnavailableReason = 'NOT_FOUND' | 'EXPIRED' | 'EXHAUSTED';

export interface CouponLookup {
  id: string;
  code: string;
  discountBp: number;
  maxRedemptions: number | null;
  expiresAt: Date | null;
}

/**
 * Pure -- no DB. The ONE place "is this coupon usable?" is written. Used by
 * validateCoupon's read-only pre-check below AND by invoicing/
 * repository.ts's own in-transaction, row-locked re-check (which can't call
 * validateCoupon itself -- that function owns its own plain-`prisma` calls,
 * not the caller's withOrg transaction handle the lock must run inside).
 */
export function couponUnavailableReason(
  coupon: Pick<CouponLookup, 'maxRedemptions' | 'expiresAt'>,
  redemptionCount: number,
  at: Date,
): CouponUnavailableReason | null {
  if (coupon.expiresAt && coupon.expiresAt <= at) return 'EXPIRED';
  if (coupon.maxRedemptions !== null && redemptionCount >= coupon.maxRedemptions) return 'EXHAUSTED';
  return null;
}

/**
 * Read-only fail-fast check -- no mutation, no transaction. Rejects an
 * obviously-bad code (typo, never existed, expired/deactivated/exhausted)
 * before invoicingService.applyCoupon even opens a transaction. NOT where
 * cap enforcement is guaranteed under concurrency -- that's the row-locked
 * path in invoicing/repository.ts's applyCoupon.
 */
export async function validateCoupon(
  code: string,
  at: Date = new Date(),
): Promise<{ coupon: CouponLookup } | { error: CouponUnavailableReason }> {
  const coupon = await prisma.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!coupon) return { error: 'NOT_FOUND' };
  const redemptionCount = await prisma.couponRedemption.count({ where: { couponId: coupon.id } });
  const reason = couponUnavailableReason(coupon, redemptionCount, at);
  if (reason) return { error: reason };
  return { coupon };
}

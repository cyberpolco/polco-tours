import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { generateBookingReference } from '../../src/modules/booking';
import { couponUnavailableReason, validateCoupon } from '../../src/lib/coupons';

/**
 * `Coupon` is platform-wide reference data (DR-104) -- no organizationId, no
 * withOrg needed for it, same precedent as tests/lib/tax.test.ts. Uses a
 * unique fake code per run (random, not Date.now()-based, per the DR-103
 * gotcha about parallel-test-file collisions on a unique column).
 *
 * CouponRedemption.invoiceId is a real FK to Invoice, though -- the
 * EXHAUSTED case below needs one genuine (org-scoped) Invoice row to point
 * at, hence the minimal org/booking/invoice fixture.
 */
const admin = new PrismaClient();
// Uppercase -- validateCoupon normalizes input to uppercase before lookup
// (matching real generateCouponCode output, always uppercase), so a
// lowercase fixture code would never match after normalization.
const suffix = Math.floor(Math.random() * 1e12).toString(36).toUpperCase();
const activeCode = `TEST-ACTIVE-${suffix}`;
const expiredCode = `TEST-EXPIRED-${suffix}`;
const exhaustedCode = `TEST-EXHAUSTED-${suffix}`;
let orgId: string;
let exhaustedCouponId: string;
let fixtureInvoiceId: string;

beforeAll(async () => {
  await admin.coupon.create({ data: { code: activeCode, discountBp: 1000 } });
  await admin.coupon.create({ data: { code: expiredCode, discountBp: 1000, expiresAt: new Date('2020-01-01') } });
  const exhausted = await admin.coupon.create({ data: { code: exhaustedCode, discountBp: 1000, maxRedemptions: 1 } });
  exhaustedCouponId = exhausted.id;

  const org = await admin.organization.create({
    data: { name: `COUPONS-LIB-TEST-${suffix}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;
  const tourist = await admin.user.create({
    data: { email: `coupons-lib-${suffix}@example.test`, role: 'TOURIST', organizationId: orgId },
  });

  await withOrg(orgId, async (tx) => {
    const booking = await tx.booking.create({
      data: { organizationId: orgId, touristUserId: tourist.id, seats: 1, bookingReference: generateBookingReference() },
    });
    const invoice = await tx.invoice.create({
      data: {
        organizationId: orgId,
        bookingId: booking.id,
        currency: 'USD',
        subtotalMinor: 10000,
        taxRateBp: 1000,
        taxMinor: 1000,
        totalMinor: 11000,
        depositMinor: 3300,
        balanceMinor: 7700,
        status: 'ISSUED',
      },
    });
    fixtureInvoiceId = invoice.id;
  });
});

afterAll(async () => {
  if (!orgId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await admin.couponRedemption.deleteMany({ where: { couponId: exhaustedCouponId } });
  await admin.coupon.deleteMany({ where: { code: { in: [activeCode, expiredCode, exhaustedCode] } } });
  await withOrg(orgId, (tx) => tx.invoice.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.booking.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('couponUnavailableReason', () => {
  const at = new Date('2026-06-01');

  it('returns null for an active, unexpired, under-cap coupon', () => {
    expect(couponUnavailableReason({ maxRedemptions: null, expiresAt: null }, 0, at)).toBeNull();
  });

  it('returns EXPIRED once expiresAt is at or before "at"', () => {
    expect(couponUnavailableReason({ maxRedemptions: null, expiresAt: new Date('2026-01-01') }, 0, at)).toBe('EXPIRED');
    // Not yet expired at the exact boundary moment before expiresAt.
    expect(couponUnavailableReason({ maxRedemptions: null, expiresAt: new Date('2026-12-31') }, 0, at)).toBeNull();
  });

  it('returns EXHAUSTED once redemptionCount reaches maxRedemptions', () => {
    expect(couponUnavailableReason({ maxRedemptions: 3, expiresAt: null }, 3, at)).toBe('EXHAUSTED');
    expect(couponUnavailableReason({ maxRedemptions: 3, expiresAt: null }, 2, at)).toBeNull();
  });

  it('maxRedemptions: null never returns EXHAUSTED, no matter how high the count', () => {
    expect(couponUnavailableReason({ maxRedemptions: null, expiresAt: null }, 1_000_000, at)).toBeNull();
  });
});

describe('validateCoupon', () => {
  it('returns NOT_FOUND for an unknown code', async () => {
    const result = await validateCoupon(`${activeCode}-DOES-NOT-EXIST`);
    expect(result).toEqual({ error: 'NOT_FOUND' });
  });

  it('is case-insensitive and trims whitespace', async () => {
    const result = await validateCoupon(`  ${activeCode.toLowerCase()}  `);
    expect('coupon' in result).toBe(true);
  });

  it('returns the coupon for a valid, active code', async () => {
    const result = await validateCoupon(activeCode);
    if ('error' in result) throw new Error('expected a coupon');
    expect(result.coupon.code).toBe(activeCode);
    expect(result.coupon.discountBp).toBe(1000);
  });

  it('returns EXPIRED for an expired code', async () => {
    expect(await validateCoupon(expiredCode)).toEqual({ error: 'EXPIRED' });
  });

  it('returns EXHAUSTED once redemptions reach the cap', async () => {
    await admin.couponRedemption.create({
      data: { couponId: exhaustedCouponId, invoiceId: fixtureInvoiceId, discountMinor: 100 },
    });
    expect(await validateCoupon(exhaustedCode)).toEqual({ error: 'EXHAUSTED' });
  });
});

// DR-144 (explicit user request, reverses DR-104's soft-deactivate-only
// design): deleting a Coupon now cascades to its CouponRedemption rows
// (schema.prisma's onDelete: Cascade), a confirmed trade-off -- this test
// exercises the real DB constraint directly, using the redemption the test
// above just created, rather than mocking Prisma's cascade behavior.
describe('deleting a Coupon cascades to its CouponRedemption rows (DR-144)', () => {
  it('removes redemption history and makes the code NOT_FOUND, not a separate soft-off reason', async () => {
    const before = await admin.couponRedemption.count({ where: { couponId: exhaustedCouponId } });
    expect(before).toBeGreaterThan(0);

    await admin.coupon.delete({ where: { id: exhaustedCouponId } });

    const after = await admin.couponRedemption.count({ where: { couponId: exhaustedCouponId } });
    expect(after).toBe(0);
    expect(await validateCoupon(exhaustedCode)).toEqual({ error: 'NOT_FOUND' });
  });
});

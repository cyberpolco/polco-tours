// settings module — repository. The only place that touches
// prisma.taxRate/platformRate/coupon for this module. All three tables are
// platform-wide (no organizationId, no RLS -- same precedent as the finance
// module's rate tables), uses the plain global `prisma` client, no withOrg.
import { Prisma, type Coupon, type PlatformRate, type TaxRate } from '@prisma/client';
import { prisma } from '@lib/db';
import { generateCouponCode } from './domain';
import type { CouponView, CreateCouponInput, CreatePlatformRateInput, CreateTaxRateInput, PlatformRateView, TaxRateView } from './domain';

function toTaxRateView(r: TaxRate): TaxRateView {
  return { id: r.id, country: r.country, taxType: r.taxType, rateBp: r.rateBp, validFrom: r.validFrom, validTo: r.validTo };
}
function toPlatformRateView(r: PlatformRate): PlatformRateView {
  return { id: r.id, rateBp: r.rateBp, validFrom: r.validFrom, validTo: r.validTo };
}
function toCouponView(c: Coupon, redemptionCount: number): CouponView {
  return {
    id: c.id,
    code: c.code,
    discountBp: c.discountBp,
    maxRedemptions: c.maxRedemptions,
    expiresAt: c.expiresAt,
    deactivatedAt: c.deactivatedAt,
    redemptionCount,
    createdAt: c.createdAt,
  };
}

const MAX_CODE_GENERATION_ATTEMPTS = 5; // same constant/shape as booking/repository.ts's

/** code is freshly random per coupon (see domain.ts's generateCouponCode) --
 * the DB's `@unique` constraint is what actually guarantees no two coupons
 * ever share a code, and this retry turns a rare collision into an
 * invisible regenerate-and-retry. Mirrors booking/repository.ts's
 * createBookingWithUniqueReference exactly. */
async function createCouponWithUniqueCode(create: (code: string) => Promise<Coupon>): Promise<Coupon> {
  for (let attempt = 1; attempt <= MAX_CODE_GENERATION_ATTEMPTS; attempt++) {
    try {
      return await create(generateCouponCode());
    } catch (err) {
      const isLastAttempt = attempt === MAX_CODE_GENERATION_ATTEMPTS;
      if (isLastAttempt || !(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err;
    }
  }
  throw new Error('unreachable');
}

export const settingsRepository = {
  // -------------------------------------------------------------- TaxRate
  async listTaxRates(): Promise<TaxRateView[]> {
    const rows = await prisma.taxRate.findMany({ orderBy: [{ country: 'asc' }, { taxType: 'asc' }, { validFrom: 'desc' }] });
    return rows.map(toTaxRateView);
  },
  async createTaxRate(input: CreateTaxRateInput): Promise<TaxRateView> {
    const r = await prisma.taxRate.create({ data: input });
    return toTaxRateView(r);
  },
  async deleteTaxRate(id: string): Promise<TaxRateView | null> {
    const existing = await prisma.taxRate.findUnique({ where: { id } });
    if (!existing) return null;
    await prisma.taxRate.delete({ where: { id } });
    return toTaxRateView(existing);
  },

  // --------------------------------------------------------- PlatformRate
  async listPlatformRates(): Promise<PlatformRateView[]> {
    const rows = await prisma.platformRate.findMany({ orderBy: { validFrom: 'desc' } });
    return rows.map(toPlatformRateView);
  },
  async createPlatformRate(input: CreatePlatformRateInput): Promise<PlatformRateView> {
    const r = await prisma.platformRate.create({ data: input });
    return toPlatformRateView(r);
  },
  async deletePlatformRate(id: string): Promise<PlatformRateView | null> {
    const existing = await prisma.platformRate.findUnique({ where: { id } });
    if (!existing) return null;
    await prisma.platformRate.delete({ where: { id } });
    return toPlatformRateView(existing);
  },

  // -------------------------------------------------------------- Coupon
  async listCoupons(): Promise<CouponView[]> {
    const rows = await prisma.coupon.findMany({
      include: { _count: { select: { redemptions: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => toCouponView(r, r._count.redemptions));
  },
  async createCoupon(input: CreateCouponInput): Promise<CouponView> {
    const c = await createCouponWithUniqueCode((code) =>
      prisma.coupon.create({
        data: {
          code,
          discountBp: input.discountBp,
          maxRedemptions: input.maxRedemptions ?? null,
          expiresAt: input.expiresAt ?? null,
        },
      }),
    );
    return toCouponView(c, 0);
  },
  async deactivateCoupon(id: string): Promise<CouponView | null> {
    const existing = await prisma.coupon.findUnique({ where: { id }, include: { _count: { select: { redemptions: true } } } });
    if (!existing) return null;
    const updated = await prisma.coupon.update({ where: { id }, data: { deactivatedAt: new Date() } });
    return toCouponView(updated, existing._count.redemptions);
  },
};

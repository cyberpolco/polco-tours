import { prisma } from './db';

/**
 * Effective-dated lead-time-surcharge lookup (DR-198). `LateBookingRate` is
 * platform-wide reference data (no organizationId, no RLS policy) -- no
 * withOrg scoping applies here, same precedent as getEffectivePlatformRate/
 * getEffectiveTaxRate.
 */
export interface EffectiveLateBookingRate {
  thresholdDays: number;
  surchargeRateBp: number;
}

export async function getEffectiveLateBookingRate(at: Date = new Date()): Promise<EffectiveLateBookingRate> {
  const row = await prisma.lateBookingRate.findFirst({
    where: {
      validFrom: { lte: at },
      OR: [{ validTo: null }, { validTo: { gte: at } }],
    },
    orderBy: { validFrom: 'desc' },
  });
  if (!row) {
    throw new Error(`No effective late-booking rate at ${at.toISOString()}`);
  }
  return { thresholdDays: row.thresholdDays, surchargeRateBp: row.surchargeRateBp };
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Returns the surcharge bp to snapshot onto a Booking, or null if
 * `travelDate` is far enough out that the surcharge doesn't apply.
 * `< thresholdDays` triggers it -- e.g. threshold 21: exactly 21 days out is
 * unaffected, 20 or fewer is late. Same `MS_PER_DAY` day-diff convention as
 * fleet/domain.ts's daysUntilExpiry. */
export function computeLateBookingSurchargeBp(
  travelDate: Date,
  rate: EffectiveLateBookingRate,
  now: Date = new Date(),
): number | null {
  const daysUntilTravel = (travelDate.getTime() - now.getTime()) / MS_PER_DAY;
  return daysUntilTravel < rate.thresholdDays ? rate.surchargeRateBp : null;
}

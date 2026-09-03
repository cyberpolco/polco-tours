import type { Currency } from '@prisma/client';
import { prisma } from './db';

/**
 * Effective-dated per-(country, data-plan tier) e-SIM add-on pricing
 * (DR-222). `EsimDataPlanRate` is platform-wide reference data (no
 * organizationId, no RLS policy) -- same precedent as
 * src/lib/addon-rates.ts's getEffectiveAddonRate, and for the same reason:
 * guest checkout (an anonymous session, no staff permissions) must be able
 * to read this too, so it's a plain query, not routed through
 * financeService's RBAC-gated methods.
 *
 * Returns null rather than throwing when no rate is configured for this
 * country+tier -- callers reject the selection outright, there is no
 * fallback price.
 */
export interface EffectiveEsimRate {
  priceMinor: number;
  currency: Currency;
}

export async function getEffectiveEsimRate(country: string, dataAllowanceGb: number, at: Date = new Date()): Promise<EffectiveEsimRate | null> {
  const row = await prisma.esimDataPlanRate.findFirst({
    where: { country, dataAllowanceGb, validFrom: { lte: at }, OR: [{ validTo: null }, { validTo: { gte: at } }] },
    orderBy: { validFrom: 'desc' },
  });
  return row ? { priceMinor: row.priceMinor, currency: row.currency } : null;
}

import type { AddonCode, Currency } from '@prisma/client';
import { prisma } from './db';

/**
 * Effective-dated per-(country, code) add-on pricing (DR-128). `AddonRate`
 * is platform-wide reference data (no organizationId, no RLS policy) --
 * same precedent as src/lib/tax.ts's getEffectiveTaxRate, and for the same
 * reason: guest checkout (an anonymous session, no staff permissions) must
 * be able to read this too, so it's a plain query, not routed through
 * financeService's RBAC-gated methods.
 *
 * Returns null rather than throwing when no rate is configured for this
 * country+code -- callers hide the add-on entirely (never fall back to
 * AddonService's own flat priceMinor/currency, which this table
 * supersedes for pricing purposes).
 */
export interface EffectiveAddonRate {
  priceMinor: number;
  currency: Currency;
}

export async function getEffectiveAddonRate(country: string, code: AddonCode, at: Date = new Date()): Promise<EffectiveAddonRate | null> {
  const row = await prisma.addonRate.findFirst({
    where: { country, code, validFrom: { lte: at }, OR: [{ validTo: null }, { validTo: { gte: at } }] },
    orderBy: { validFrom: 'desc' },
  });
  return row ? { priceMinor: row.priceMinor, currency: row.currency } : null;
}

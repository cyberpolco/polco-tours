import { prisma } from './db';

/**
 * Effective-dated per-country tax lookup (DR-006 / BR-01). `TaxRate` is
 * platform-wide reference data (no organizationId, no RLS policy) -- no
 * withOrg scoping applies here, unlike every tenant-scoped table.
 */
export interface EffectiveTaxRate {
  rateBp: number;
  taxType: string;
}

export async function getEffectiveTaxRate(
  country: string,
  at: Date = new Date(),
  taxType = 'VAT',
): Promise<EffectiveTaxRate> {
  const row = await prisma.taxRate.findFirst({
    where: {
      country,
      taxType,
      validFrom: { lte: at },
      OR: [{ validTo: null }, { validTo: { gte: at } }],
    },
    orderBy: { validFrom: 'desc' },
  });
  if (!row) {
    throw new Error(`No effective ${taxType} rate for country ${country} at ${at.toISOString()}`);
  }
  return { rateBp: row.rateBp, taxType: row.taxType };
}

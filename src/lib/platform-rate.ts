import { prisma } from './db';

/**
 * Effective-dated platform-commission lookup (DR-042). `PlatformRate` is
 * platform-wide reference data (no organizationId, no RLS policy) -- no
 * withOrg scoping applies here, unlike every tenant-scoped table. Mirrors
 * getEffectiveTaxRate exactly, minus the per-country dimension (this is a
 * single global rate).
 */
export interface EffectivePlatformRate {
  rateBp: number;
}

export async function getEffectivePlatformRate(at: Date = new Date()): Promise<EffectivePlatformRate> {
  const row = await prisma.platformRate.findFirst({
    where: {
      validFrom: { lte: at },
      OR: [{ validTo: null }, { validTo: { gte: at } }],
    },
    orderBy: { validFrom: 'desc' },
  });
  if (!row) {
    throw new Error(`No effective platform rate at ${at.toISOString()}`);
  }
  return { rateBp: row.rateBp };
}

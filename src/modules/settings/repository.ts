// settings module — repository. The only place that touches
// prisma.taxRate/platformRate for this module. Both tables are platform-wide
// (no organizationId, no RLS -- same precedent as the finance module's rate
// tables), uses the plain global `prisma` client, no withOrg.
import type { PlatformRate, TaxRate } from '@prisma/client';
import { prisma } from '@lib/db';
import type { CreatePlatformRateInput, CreateTaxRateInput, PlatformRateView, TaxRateView } from './domain';

function toTaxRateView(r: TaxRate): TaxRateView {
  return { id: r.id, country: r.country, taxType: r.taxType, rateBp: r.rateBp, validFrom: r.validFrom, validTo: r.validTo };
}
function toPlatformRateView(r: PlatformRate): PlatformRateView {
  return { id: r.id, rateBp: r.rateBp, validFrom: r.validFrom, validTo: r.validTo };
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
};

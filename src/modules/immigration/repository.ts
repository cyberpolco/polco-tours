// immigration module — repository. Only place touching Prisma for this
// module. CountryRegulation is platform-wide reference data (no
// organizationId, no RLS) -- queries go through the bare `prisma` client
// directly, never `withOrg`, same convention as src/lib/tax.ts's TaxRate
// lookup.
import type { CountryRegulation } from '@prisma/client';
import { prisma } from '@lib/db';
import type { CountryRegulationView, CreateCountryRegulationInput, UpdateCountryRegulationInput } from './domain';

function toView(r: CountryRegulation): CountryRegulationView {
  return {
    id: r.id,
    country: r.country,
    visaRequirements: r.visaRequirements,
    requiredDocuments: r.requiredDocuments,
    processingTimeDays: r.processingTimeDays,
    entryConditions: r.entryConditions,
    immigrationFeeMinor: r.immigrationFeeMinor,
    feeCurrency: r.feeCurrency,
    embassyName: r.embassyName,
    embassyAddress: r.embassyAddress,
    embassyPhone: r.embassyPhone,
    embassyEmail: r.embassyEmail,
    healthRequirements: r.healthRequirements,
    travelAdvisories: r.travelAdvisories,
    specialRestrictions: r.specialRestrictions,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export const immigrationRepository = {
  async list(): Promise<CountryRegulationView[]> {
    const rows = await prisma.countryRegulation.findMany({ orderBy: { country: 'asc' } });
    return rows.map(toView);
  },

  async findByCountry(country: string): Promise<CountryRegulationView | null> {
    const row = await prisma.countryRegulation.findUnique({ where: { country } });
    return row ? toView(row) : null;
  },

  async create(input: CreateCountryRegulationInput): Promise<CountryRegulationView> {
    const row = await prisma.countryRegulation.create({ data: input });
    return toView(row);
  },

  async update(country: string, input: UpdateCountryRegulationInput): Promise<CountryRegulationView | null> {
    try {
      const row = await prisma.countryRegulation.update({ where: { country }, data: input });
      return toView(row);
    } catch {
      return null;
    }
  },

  async remove(country: string): Promise<boolean> {
    try {
      await prisma.countryRegulation.delete({ where: { country } });
      return true;
    } catch {
      return false;
    }
  },
};

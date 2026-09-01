// immigration module — domain types & rules. Pure; no framework or DB imports.
import type { Currency, Role } from '@prisma/client';
import { z } from 'zod';

export interface CountryRegulationView {
  id: string;
  country: string;
  visaRequirements: string;
  requiredDocuments: string;
  processingTimeDays: number | null;
  entryConditions: string;
  immigrationFeeMinor: number | null;
  feeCurrency: Currency | null;
  embassyName: string | null;
  embassyAddress: string | null;
  embassyPhone: string | null;
  embassyEmail: string | null;
  healthRequirements: string;
  travelAdvisories: string | null;
  specialRestrictions: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// DR-184: minimal, no-ctx-safe projection for other modules (e.g. visa) to
// read the government fee without country_regulation.read -- deliberately
// excludes every other field (visa text, embassy contact, advisories).
export interface CountryRegulationPublicFee {
  governmentFeeMinor: number | null;
  feeCurrency: Currency | null;
}

// DR-212 (explicit user request): same minimal, no-ctx-safe shape as
// CountryRegulationPublicFee above -- just the one staff-authored summary
// paragraph, never the embassy contact/health/advisories/fee fields. Lets
// the guest /find-booking lookup show a brief, purely informational visa
// note regardless of whether Visa Assistance was purchased as an add-on
// (unlike VisaApplication tracking status, which only exists once it was).
export interface CountryRegulationPublicVisaInfo {
  visaRequirements: string;
}

export const CreateCountryRegulationInput = z.object({
  country: z.string().length(2),
  visaRequirements: z.string().min(1),
  requiredDocuments: z.string().min(1),
  processingTimeDays: z.number().int().nonnegative().optional(),
  entryConditions: z.string().min(1),
  immigrationFeeMinor: z.number().int().nonnegative().optional(),
  feeCurrency: z.enum(['USD', 'EUR', 'NAD', 'CDF']).optional(),
  embassyName: z.string().max(200).optional(),
  embassyAddress: z.string().max(500).optional(),
  embassyPhone: z.string().max(50).optional(),
  embassyEmail: z.string().email().optional(),
  healthRequirements: z.string().min(1),
  travelAdvisories: z.string().optional(),
  specialRestrictions: z.string().optional(),
});
export type CreateCountryRegulationInput = z.infer<typeof CreateCountryRegulationInput>;

export const UpdateCountryRegulationInput = CreateCountryRegulationInput.omit({ country: true }).partial();
export type UpdateCountryRegulationInput = z.infer<typeof UpdateCountryRegulationInput>;

// country_regulation.write passes the route-level RBAC gate for both
// wildcard roles (SUPERADMIN, PLATFORM_ADMIN) -- see rbac.ts's comment on
// the Permission literal for why the matrix alone can't express this. Only
// SUPERADMIN may actually mutate country regulations (DR-034, explicit user
// choice: "the tour operator cannot delete nor edit country regulations" +
// a direct follow-up confirming PLATFORM_ADMIN is excluded too) -- the
// platform's first real behavioral split between the two admin roles.
export function isCountryRegulationWriter(roles: Role[]): boolean {
  return roles.includes('SUPERADMIN');
}

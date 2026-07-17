// settings module — domain types & rules. Pure; no framework or DB imports.
// Settings Module (DR-042) -- closes DR-035's parked "Configure system
// settings" item. Owns TaxRate (existed since Phase 0, no CRUD/UI until now)
// and PlatformRate (new: the platform's own commission on every online
// payment). Both are platform-wide, effective-dated reference data, no
// organizationId/RLS -- same precedent as CountryRegulation/RolePermission.
import { z } from 'zod';

const EFFECTIVE_DATING = {
  validFrom: z.coerce.date().optional(),
  validTo: z.coerce.date().optional(),
};

export interface TaxRateView {
  id: string;
  country: string;
  taxType: string;
  rateBp: number;
  validFrom: Date;
  validTo: Date | null;
}

export const CreateTaxRateInput = z.object({
  country: z.string().length(2),
  taxType: z.string().min(1).max(50).optional(),
  rateBp: z.number().int().nonnegative(),
  ...EFFECTIVE_DATING,
});
export type CreateTaxRateInput = z.infer<typeof CreateTaxRateInput>;

export interface PlatformRateView {
  id: string;
  rateBp: number;
  validFrom: Date;
  validTo: Date | null;
}

export const CreatePlatformRateInput = z.object({
  rateBp: z.number().int().nonnegative(),
  ...EFFECTIVE_DATING,
});
export type CreatePlatformRateInput = z.infer<typeof CreatePlatformRateInput>;

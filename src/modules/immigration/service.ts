// immigration module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import type { AuthContext } from '@modules/auth';
import { audit } from '@lib/audit';
import { Errors } from '@lib/errors';
import { assertCan } from '@lib/rbac';
import { isCountryRegulationWriter, type CountryRegulationView, type CreateCountryRegulationInput, type UpdateCountryRegulationInput } from './domain';
import { immigrationRepository } from './repository';

function requireWriter(ctx: AuthContext): void {
  assertCan(ctx.roles, 'country_regulation.write');
  if (!isCountryRegulationWriter(ctx.roles)) {
    throw Errors.forbidden('Only SUPERADMIN may modify country regulations');
  }
}

export const immigrationService = {
  async listRegulations(ctx: AuthContext): Promise<CountryRegulationView[]> {
    assertCan(ctx.roles, 'country_regulation.read');
    return immigrationRepository.list();
  },

  async getRegulation(ctx: AuthContext, country: string): Promise<CountryRegulationView> {
    assertCan(ctx.roles, 'country_regulation.read');
    const regulation = await immigrationRepository.findByCountry(country.toUpperCase());
    if (!regulation) throw Errors.notFound('No regulation on file for this country');
    return regulation;
  },

  async createRegulation(ctx: AuthContext, input: CreateCountryRegulationInput): Promise<CountryRegulationView> {
    requireWriter(ctx);
    const country = input.country.toUpperCase();
    const existing = await immigrationRepository.findByCountry(country);
    if (existing) throw Errors.conflict('A regulation already exists for this country');

    const regulation = await immigrationRepository.create({ ...input, country });
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'immigration.regulation_created',
      resourceType: 'CountryRegulation',
      resourceId: regulation.id,
    });
    return regulation;
  },

  async updateRegulation(ctx: AuthContext, country: string, input: UpdateCountryRegulationInput): Promise<CountryRegulationView> {
    requireWriter(ctx);
    const updated = await immigrationRepository.update(country.toUpperCase(), input);
    if (!updated) throw Errors.notFound('No regulation on file for this country');

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'immigration.regulation_updated',
      resourceType: 'CountryRegulation',
      resourceId: updated.id,
    });
    return updated;
  },

  async deleteRegulation(ctx: AuthContext, country: string): Promise<void> {
    requireWriter(ctx);
    const existing = await immigrationRepository.findByCountry(country.toUpperCase());
    if (!existing) throw Errors.notFound('No regulation on file for this country');

    await immigrationRepository.remove(country.toUpperCase());
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'immigration.regulation_deleted',
      resourceType: 'CountryRegulation',
      resourceId: existing.id,
    });
  },
};

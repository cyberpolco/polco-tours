// settings module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import type { AuthContext } from '@modules/auth';
import { audit } from '@lib/audit';
import { Errors } from '@lib/errors';
import { assertCan } from '@lib/rbac';
import type { CreatePlatformRateInput, CreateTaxRateInput, PlatformRateView, TaxRateView } from './domain';
import { settingsRepository } from './repository';

/** Same layering as financeService's requireRateWriter/immigration's
 * isCountryRegulationWriter -- a direct role-identity check, not just the
 * platform_settings.write permission, since a future SUPERADMIN could
 * otherwise grant that permission to PLATFORM_ADMIN and silently change
 * who this actually means. */
function requireSettingsWriter(ctx: AuthContext): void {
  assertCan(ctx, 'platform_settings.write');
  if (!ctx.roles.includes('SUPERADMIN')) {
    throw Errors.forbidden('Only SUPERADMIN may configure platform settings');
  }
}

export const settingsService = {
  // -------------------------------------------------------------- TaxRate
  async listTaxRates(ctx: AuthContext): Promise<TaxRateView[]> {
    assertCan(ctx, 'platform_settings.read');
    return settingsRepository.listTaxRates();
  },
  async createTaxRate(ctx: AuthContext, input: CreateTaxRateInput): Promise<TaxRateView> {
    requireSettingsWriter(ctx);
    const rate = await settingsRepository.createTaxRate(input);
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'settings.tax_rate_created', resourceType: 'TaxRate', resourceId: rate.id });
    return rate;
  },
  async deleteTaxRate(ctx: AuthContext, id: string): Promise<void> {
    requireSettingsWriter(ctx);
    const deleted = await settingsRepository.deleteTaxRate(id);
    if (!deleted) throw Errors.notFound('Tax rate not found');
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'settings.tax_rate_deleted', resourceType: 'TaxRate', resourceId: id });
  },

  // --------------------------------------------------------- PlatformRate
  async listPlatformRates(ctx: AuthContext): Promise<PlatformRateView[]> {
    assertCan(ctx, 'platform_settings.read');
    return settingsRepository.listPlatformRates();
  },
  async createPlatformRate(ctx: AuthContext, input: CreatePlatformRateInput): Promise<PlatformRateView> {
    requireSettingsWriter(ctx);
    const rate = await settingsRepository.createPlatformRate(input);
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'settings.platform_rate_created', resourceType: 'PlatformRate', resourceId: rate.id });
    return rate;
  },
  async deletePlatformRate(ctx: AuthContext, id: string): Promise<void> {
    requireSettingsWriter(ctx);
    const deleted = await settingsRepository.deletePlatformRate(id);
    if (!deleted) throw Errors.notFound('Platform rate not found');
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'settings.platform_rate_deleted', resourceType: 'PlatformRate', resourceId: id });
  },
};

// settings module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import type { AuthContext } from '@modules/auth';
// New settings -> finance dependency (confirmed acyclic -- finance depends
// on {auth, catalog, booking, itinerary}, never settings): updating a
// TaxRate/PlatformRate feeds the same TourPackage.priceMinor snapshot the
// finance module's own 8 cost-plus rates do (DR-134/DR-145), so it reuses
// the exact same reapply-every-breakdown sweep DR-136 introduced for those,
// rather than leaving every existing package/booking price stale until
// someone happens to re-save its cost breakdown.
import { financeService, type ReapplyRatesResult } from '@modules/finance';
import { audit } from '@lib/audit';
import { Errors } from '@lib/errors';
import { assertCan } from '@lib/rbac';
import type {
  CouponView,
  CreateCouponInput,
  CreatePlatformRateInput,
  CreateTaxRateInput,
  PlatformRateView,
  TaxRateView,
  UpdateCouponInput,
  UpdatePlatformRateInput,
  UpdateTaxRateInput,
} from './domain';
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
  /** Explicit user request: an in-place update, not just delete-and-
   * recreate -- since a package/booking's stored price/tax snapshot
   * (DR-134/DR-145) is only ever refreshed by re-saving its cost
   * breakdown, this also reapplies every existing one so a changed tax
   * rate doesn't leave every package's priceMinor stale, same "update
   * triggers reapply" precedent as financeService's updateXRate family
   * (DR-136). */
  async updateTaxRate(ctx: AuthContext, id: string, input: UpdateTaxRateInput): Promise<{ rate: TaxRateView; reapply: ReapplyRatesResult }> {
    requireSettingsWriter(ctx);
    const rate = await settingsRepository.updateTaxRate(id, input);
    if (!rate) throw Errors.notFound('Tax rate not found');
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'settings.tax_rate_updated', resourceType: 'TaxRate', resourceId: id });
    const reapply = await financeService.reapplyRatesToAllCostBreakdowns(ctx);
    return { rate, reapply };
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
  /** Same as updateTaxRate above -- explicit user request, same reapply
   * precedent (PlatformRate feeds the same priceMinor snapshot, DR-127/134). */
  async updatePlatformRate(ctx: AuthContext, id: string, input: UpdatePlatformRateInput): Promise<{ rate: PlatformRateView; reapply: ReapplyRatesResult }> {
    requireSettingsWriter(ctx);
    const rate = await settingsRepository.updatePlatformRate(id, input);
    if (!rate) throw Errors.notFound('Platform rate not found');
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'settings.platform_rate_updated', resourceType: 'PlatformRate', resourceId: id });
    const reapply = await financeService.reapplyRatesToAllCostBreakdowns(ctx);
    return { rate, reapply };
  },
  async deletePlatformRate(ctx: AuthContext, id: string): Promise<void> {
    requireSettingsWriter(ctx);
    const deleted = await settingsRepository.deletePlatformRate(id);
    if (!deleted) throw Errors.notFound('Platform rate not found');
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'settings.platform_rate_deleted', resourceType: 'PlatformRate', resourceId: id });
  },

  // -------------------------------------------------------------- Coupon
  async listCoupons(ctx: AuthContext): Promise<CouponView[]> {
    assertCan(ctx, 'platform_settings.read');
    return settingsRepository.listCoupons();
  },
  async createCoupon(ctx: AuthContext, input: CreateCouponInput): Promise<CouponView> {
    requireSettingsWriter(ctx);
    const coupon = await settingsRepository.createCoupon(input);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'settings.coupon_created',
      resourceType: 'Coupon',
      resourceId: coupon.id,
      metadata: { discountBp: coupon.discountBp, maxRedemptions: coupon.maxRedemptions },
    });
    return coupon;
  },
  async updateCoupon(ctx: AuthContext, id: string, input: UpdateCouponInput): Promise<CouponView> {
    requireSettingsWriter(ctx);
    const updated = await settingsRepository.updateCoupon(id, input);
    if (!updated) throw Errors.notFound('Coupon not found');
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'settings.coupon_updated',
      resourceType: 'Coupon',
      resourceId: id,
      metadata: { discountBp: input.discountBp, maxRedemptions: input.maxRedemptions ?? null },
    });
    return updated;
  },
  /** DR-144 (explicit user request): a genuine delete, replacing the
   * original DR-104 deactivate-only design -- also removes that coupon's
   * CouponRedemption history (schema-level cascade), a confirmed trade-off
   * (see schema.prisma's comment). The settings.coupon_deleted audit entry
   * is what's left as the record that this coupon existed. */
  async deleteCoupon(ctx: AuthContext, id: string): Promise<void> {
    requireSettingsWriter(ctx);
    const deleted = await settingsRepository.deleteCoupon(id);
    if (!deleted) throw Errors.notFound('Coupon not found');
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'settings.coupon_deleted',
      resourceType: 'Coupon',
      resourceId: id,
      metadata: { code: deleted.code, redemptionCount: deleted.redemptionCount },
    });
  },
};

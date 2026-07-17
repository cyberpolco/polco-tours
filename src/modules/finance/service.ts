// finance module — service. Business logic; orchestrates repository + rbac
// + the pure cost-computation rules. Callable by other modules ONLY
// through index.ts (module boundary rule).
import type { AuthContext } from '@modules/auth';
import { catalogService } from '@modules/catalog';
import { audit } from '@lib/audit';
import { Errors } from '@lib/errors';
import { assertCan } from '@lib/rbac';
import {
  computeBaseCostMinor,
  computeSellingPriceMinor,
  perSeatPriceMinor,
  type ActivityFeeView,
  type CreateActivityFeeInput,
  type CreateFoodBeverageRateInput,
  type CreateHotelRateInput,
  type CreateImmigrationCostRateInput,
  type CreateStaffRateInput,
  type CreateTransportRateInput,
  type FoodBeverageRateView,
  type HotelRateView,
  type ImmigrationCostRateView,
  type PackageCostBreakdownView,
  type SaveCostBreakdownInput,
  type StaffRateView,
  type TransportRateView,
} from './domain';
import { financeRepository } from './repository';

function requireOrg(ctx: AuthContext): string {
  if (!ctx.organizationId) throw Errors.forbidden('No organization membership');
  return ctx.organizationId;
}

/** Spec: "The Super Admin can configure" operational rates -- a direct
 * role-identity check, not just the finance_config.write permission, same
 * layering as immigration/service.ts's isCountryRegulationWriter (DR-034):
 * the permission-matrix editor can't be trusted alone since a future
 * SUPERADMIN could otherwise grant finance_config.write to PLATFORM_ADMIN
 * and silently change who this actually means. */
function requireRateWriter(ctx: AuthContext): void {
  assertCan(ctx, 'finance_config.write');
  if (!ctx.roles.includes('SUPERADMIN')) {
    throw Errors.forbidden('Only SUPERADMIN may configure operational rates');
  }
}

export const financeService = {
  // ------------------------------------------------------------ StaffRate
  async listStaffRates(ctx: AuthContext): Promise<StaffRateView[]> {
    assertCan(ctx, 'finance_config.read');
    return financeRepository.listStaffRates();
  },
  async createStaffRate(ctx: AuthContext, input: CreateStaffRateInput): Promise<StaffRateView> {
    requireRateWriter(ctx);
    const rate = await financeRepository.createStaffRate(input);
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'finance.staff_rate_created', resourceType: 'StaffRate', resourceId: rate.id });
    return rate;
  },
  async deleteStaffRate(ctx: AuthContext, id: string): Promise<void> {
    requireRateWriter(ctx);
    const deleted = await financeRepository.deleteStaffRate(id);
    if (!deleted) throw Errors.notFound('Staff rate not found');
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'finance.staff_rate_deleted', resourceType: 'StaffRate', resourceId: id });
  },

  // ------------------------------------------------------------ HotelRate
  async listHotelRates(ctx: AuthContext): Promise<HotelRateView[]> {
    assertCan(ctx, 'finance_config.read');
    return financeRepository.listHotelRates();
  },
  async createHotelRate(ctx: AuthContext, input: CreateHotelRateInput): Promise<HotelRateView> {
    requireRateWriter(ctx);
    const rate = await financeRepository.createHotelRate(input);
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'finance.hotel_rate_created', resourceType: 'HotelRate', resourceId: rate.id });
    return rate;
  },
  async deleteHotelRate(ctx: AuthContext, id: string): Promise<void> {
    requireRateWriter(ctx);
    const deleted = await financeRepository.deleteHotelRate(id);
    if (!deleted) throw Errors.notFound('Hotel rate not found');
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'finance.hotel_rate_deleted', resourceType: 'HotelRate', resourceId: id });
  },

  // -------------------------------------------------------- TransportRate
  async listTransportRates(ctx: AuthContext): Promise<TransportRateView[]> {
    assertCan(ctx, 'finance_config.read');
    return financeRepository.listTransportRates();
  },
  async createTransportRate(ctx: AuthContext, input: CreateTransportRateInput): Promise<TransportRateView> {
    requireRateWriter(ctx);
    const rate = await financeRepository.createTransportRate(input);
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'finance.transport_rate_created', resourceType: 'TransportRate', resourceId: rate.id });
    return rate;
  },
  async deleteTransportRate(ctx: AuthContext, id: string): Promise<void> {
    requireRateWriter(ctx);
    const deleted = await financeRepository.deleteTransportRate(id);
    if (!deleted) throw Errors.notFound('Transport rate not found');
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'finance.transport_rate_deleted', resourceType: 'TransportRate', resourceId: id });
  },

  // ---------------------------------------------------- FoodBeverageRate
  async listFoodBeverageRates(ctx: AuthContext): Promise<FoodBeverageRateView[]> {
    assertCan(ctx, 'finance_config.read');
    return financeRepository.listFoodBeverageRates();
  },
  async createFoodBeverageRate(ctx: AuthContext, input: CreateFoodBeverageRateInput): Promise<FoodBeverageRateView> {
    requireRateWriter(ctx);
    const rate = await financeRepository.createFoodBeverageRate(input);
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'finance.food_beverage_rate_created', resourceType: 'FoodBeverageRate', resourceId: rate.id });
    return rate;
  },
  async deleteFoodBeverageRate(ctx: AuthContext, id: string): Promise<void> {
    requireRateWriter(ctx);
    const deleted = await financeRepository.deleteFoodBeverageRate(id);
    if (!deleted) throw Errors.notFound('Food/beverage rate not found');
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'finance.food_beverage_rate_deleted', resourceType: 'FoodBeverageRate', resourceId: id });
  },

  // -------------------------------------------------------------- ActivityFee
  async listActivityFees(ctx: AuthContext): Promise<ActivityFeeView[]> {
    assertCan(ctx, 'finance_config.read');
    return financeRepository.listActivityFees();
  },
  async createActivityFee(ctx: AuthContext, input: CreateActivityFeeInput): Promise<ActivityFeeView> {
    requireRateWriter(ctx);
    const fee = await financeRepository.createActivityFee(input);
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'finance.activity_fee_created', resourceType: 'ActivityFee', resourceId: fee.id });
    return fee;
  },
  async deleteActivityFee(ctx: AuthContext, id: string): Promise<void> {
    requireRateWriter(ctx);
    const deleted = await financeRepository.deleteActivityFee(id);
    if (!deleted) throw Errors.notFound('Activity fee not found');
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'finance.activity_fee_deleted', resourceType: 'ActivityFee', resourceId: id });
  },

  // -------------------------------------------------------- ImmigrationCostRate
  async listImmigrationCostRates(ctx: AuthContext): Promise<ImmigrationCostRateView[]> {
    assertCan(ctx, 'finance_config.read');
    return financeRepository.listImmigrationCostRates();
  },
  async createImmigrationCostRate(ctx: AuthContext, input: CreateImmigrationCostRateInput): Promise<ImmigrationCostRateView> {
    requireRateWriter(ctx);
    const rate = await financeRepository.createImmigrationCostRate(input);
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'finance.immigration_cost_rate_created', resourceType: 'ImmigrationCostRate', resourceId: rate.id });
    return rate;
  },
  async deleteImmigrationCostRate(ctx: AuthContext, id: string): Promise<void> {
    requireRateWriter(ctx);
    const deleted = await financeRepository.deleteImmigrationCostRate(id);
    if (!deleted) throw Errors.notFound('Immigration cost rate not found');
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'finance.immigration_cost_rate_deleted', resourceType: 'ImmigrationCostRate', resourceId: id });
  },

  // ---------------------------------------------------- package cost breakdown

  /** Same viewers as who can edit the package -- catalog.write, not a new
   * permission. */
  async getCostBreakdown(ctx: AuthContext, tourPackageId: string): Promise<PackageCostBreakdownView | null> {
    assertCan(ctx, 'catalog.write');
    const organizationId = requireOrg(ctx);
    await catalogService.getPackage(ctx, tourPackageId); // 404s if not found/visible
    return financeRepository.findBreakdownForPackage(organizationId, tourPackageId);
  },

  /** Resolves every referenced rate, computes Base Cost -> Selling Price ->
   * per-seat price via the pure functions in domain.ts, writes the
   * breakdown, and pushes the result into TourPackage.priceMinor through
   * catalog's own public interface (module boundary respected -- finance
   * never writes tour_packages directly). An override replaces the
   * computed price outright and is audited with old/new values (spec:
   * "Administrators may override calculated prices ... while maintaining
   * an audit trail"). */
  async saveCostBreakdown(ctx: AuthContext, tourPackageId: string, input: SaveCostBreakdownInput): Promise<PackageCostBreakdownView> {
    assertCan(ctx, 'catalog.write');
    const organizationId = requireOrg(ctx);
    const pkg = await catalogService.getPackage(ctx, tourPackageId); // 404s if not found/visible

    if (input.currency !== pkg.currency) {
      throw Errors.validation(`Cost breakdown currency (${input.currency}) must match the package's currency (${pkg.currency})`);
    }

    const now = new Date();

    const [driverRate, guideRate, photographerRate, videographerRate, breakfastRate, lunchRate, dinnerRate] = await Promise.all([
      input.driverDays > 0 ? financeRepository.findEffectiveStaffRate(pkg.country, 'DRIVER', now) : Promise.resolve(null),
      input.guideDays > 0 ? financeRepository.findEffectiveStaffRate(pkg.country, 'GUIDE', now) : Promise.resolve(null),
      input.photographerDays > 0 ? financeRepository.findEffectiveStaffRate(pkg.country, 'PHOTOGRAPHER', now) : Promise.resolve(null),
      input.videographerDays > 0 ? financeRepository.findEffectiveStaffRate(pkg.country, 'VIDEOGRAPHER', now) : Promise.resolve(null),
      input.breakfastCount > 0 ? financeRepository.findEffectiveFoodBeverageRate(pkg.country, 'BREAKFAST', now) : Promise.resolve(null),
      input.lunchCount > 0 ? financeRepository.findEffectiveFoodBeverageRate(pkg.country, 'LUNCH', now) : Promise.resolve(null),
      input.dinnerCount > 0 ? financeRepository.findEffectiveFoodBeverageRate(pkg.country, 'DINNER', now) : Promise.resolve(null),
    ]);

    if (input.driverDays > 0 && !driverRate) throw Errors.conflict(`No effective driver rate configured for ${pkg.country}`);
    if (input.guideDays > 0 && !guideRate) throw Errors.conflict(`No effective guide rate configured for ${pkg.country}`);
    if (input.photographerDays > 0 && !photographerRate) throw Errors.conflict(`No effective photographer rate configured for ${pkg.country}`);
    if (input.videographerDays > 0 && !videographerRate) throw Errors.conflict(`No effective videographer rate configured for ${pkg.country}`);
    if (input.breakfastCount > 0 && !breakfastRate) throw Errors.conflict(`No effective breakfast rate configured for ${pkg.country}`);
    if (input.lunchCount > 0 && !lunchRate) throw Errors.conflict(`No effective lunch rate configured for ${pkg.country}`);
    if (input.dinnerCount > 0 && !dinnerRate) throw Errors.conflict(`No effective dinner rate configured for ${pkg.country}`);

    const hotelRate = input.hotelRateId ? await financeRepository.findHotelRateById(input.hotelRateId) : null;
    if (input.hotelRateId && !hotelRate) throw Errors.notFound('Hotel rate not found');

    const transportRate = input.transportRateId ? await financeRepository.findTransportRateById(input.transportRateId) : null;
    if (input.transportRateId && !transportRate) throw Errors.notFound('Transport rate not found');

    const immigrationCostRate = input.requiresVisa && input.immigrationCostRateId
      ? await financeRepository.findImmigrationCostRateById(input.immigrationCostRateId)
      : null;
    if (input.requiresVisa && input.immigrationCostRateId && !immigrationCostRate) {
      throw Errors.notFound('Immigration cost rate not found');
    }

    const foodBeverageIds = input.lineItems.map((li) => li.foodBeverageRateId).filter((id): id is string => id != null);
    const activityIds = input.lineItems.map((li) => li.activityFeeId).filter((id): id is string => id != null);
    const [foodBeverageRates, activityFees] = await Promise.all([
      financeRepository.findFoodBeverageRatesByIds(foodBeverageIds),
      financeRepository.findActivityFeesByIds(activityIds),
    ]);
    const foodBeverageById = new Map(foodBeverageRates.map((r) => [r.id, r]));
    const activityFeeById = new Map(activityFees.map((r) => [r.id, r]));

    const lineItems = input.lineItems.map((li) => {
      const perUnitMinor = li.foodBeverageRateId
        ? foodBeverageById.get(li.foodBeverageRateId)?.perUnitMinor
        : activityFeeById.get(li.activityFeeId as string)?.feeMinor;
      if (perUnitMinor == null) throw Errors.notFound('A referenced drink/activity rate was not found');
      return { perUnitMinor, quantityPerPerson: li.quantityPerPerson };
    });

    const baseCostMinor = computeBaseCostMinor({
      referenceGroupSize: input.referenceGroupSize,
      nights: input.nights,
      driverDays: input.driverDays,
      guideDays: input.guideDays,
      photographerDays: input.photographerDays,
      videographerDays: input.videographerDays,
      driverDailyRateMinor: driverRate?.dailyRateMinor ?? null,
      guideDailyRateMinor: guideRate?.dailyRateMinor ?? null,
      photographerDailyRateMinor: photographerRate?.dailyRateMinor ?? null,
      videographerDailyRateMinor: videographerRate?.dailyRateMinor ?? null,
      hotelNightlyRateMinor: hotelRate?.nightlyRateMinor ?? null,
      roomsNeeded: input.roomsNeeded,
      breakfastCount: input.breakfastCount,
      lunchCount: input.lunchCount,
      dinnerCount: input.dinnerCount,
      breakfastRateMinor: breakfastRate?.perUnitMinor ?? null,
      lunchRateMinor: lunchRate?.perUnitMinor ?? null,
      dinnerRateMinor: dinnerRate?.perUnitMinor ?? null,
      transportDays: input.transportDays,
      transportRate: transportRate
        ? {
            fuelEstimateMinor: transportRate.fuelEstimateMinor,
            tollFeesMinor: transportRate.tollFeesMinor,
            parkingFeesMinor: transportRate.parkingFeesMinor,
            vehicleOperatingCostMinor: transportRate.vehicleOperatingCostMinor,
          }
        : null,
      requiresVisa: input.requiresVisa,
      immigrationCostRate: immigrationCostRate
        ? {
            visaFeeMinor: immigrationCostRate.visaFeeMinor,
            processingFeeMinor: immigrationCostRate.processingFeeMinor,
            invitationLetterFeeMinor: immigrationCostRate.invitationLetterFeeMinor,
            borderPermitFeeMinor: immigrationCostRate.borderPermitFeeMinor,
          }
        : null,
      lineItems,
    });
    const sellingPriceTotalMinor = computeSellingPriceMinor(baseCostMinor, input.agencyMarginBp);
    const computedPerSeat = perSeatPriceMinor(sellingPriceTotalMinor, input.referenceGroupSize);
    const finalPriceMinor = input.overridePriceMinor ?? computedPerSeat;

    const breakdown = await financeRepository.upsertBreakdown(
      organizationId,
      tourPackageId,
      {
        currency: input.currency,
        referenceGroupSize: input.referenceGroupSize,
        nights: input.nights,
        driverDays: input.driverDays,
        guideDays: input.guideDays,
        photographerDays: input.photographerDays,
        videographerDays: input.videographerDays,
        hotelRateId: input.hotelRateId ?? null,
        roomsNeeded: input.roomsNeeded,
        breakfastCount: input.breakfastCount,
        lunchCount: input.lunchCount,
        dinnerCount: input.dinnerCount,
        transportRateId: input.transportRateId ?? null,
        transportDays: input.transportDays,
        requiresVisa: input.requiresVisa,
        immigrationCostRateId: input.immigrationCostRateId ?? null,
        agencyMarginBp: input.agencyMarginBp,
        computedBaseCostMinor: baseCostMinor,
        computedSellingPriceMinor: sellingPriceTotalMinor,
        overridePriceMinor: input.overridePriceMinor ?? null,
        overrideReason: input.overrideReason ?? null,
        overriddenByUserId: input.overridePriceMinor != null ? ctx.userId : null,
        overriddenAt: input.overridePriceMinor != null ? now : null,
      },
      input.lineItems.map((li) => ({ foodBeverageRateId: li.foodBeverageRateId, activityFeeId: li.activityFeeId, quantityPerPerson: li.quantityPerPerson })),
    );

    await catalogService.updatePackage(ctx, tourPackageId, { priceMinor: finalPriceMinor });

    if (input.overridePriceMinor != null) {
      await audit({
        actorUserId: ctx.userId,
        actorRole: ctx.roles[0],
        action: 'finance.price_overridden',
        resourceType: 'TourPackage',
        resourceId: tourPackageId,
        organizationId,
        metadata: { previousPriceMinor: pkg.priceMinor, computedPriceMinor: computedPerSeat, overridePriceMinor: finalPriceMinor, reason: input.overrideReason },
      });
    } else {
      await audit({
        actorUserId: ctx.userId,
        actorRole: ctx.roles[0],
        action: 'finance.cost_breakdown_saved',
        resourceType: 'TourPackage',
        resourceId: tourPackageId,
        organizationId,
        metadata: { previousPriceMinor: pkg.priceMinor, computedPriceMinor: finalPriceMinor },
      });
    }

    return breakdown;
  },
};

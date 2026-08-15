// finance module — service. Business logic; orchestrates repository + rbac
// + the pure cost-computation rules. Callable by other modules ONLY
// through index.ts (module boundary rule).
import type { Currency } from '@prisma/client';
import type { AuthContext } from '@modules/auth';
import { bookingService, isBookingLocked } from '@modules/booking';
import { catalogService } from '@modules/catalog';
// DR-116: new finance -> itinerary dependency (confirmed acyclic -- itinerary
// only imports {auth, assignment, booking, catalog}, never finance) so the
// Accommodation operational-rate rows can reference a real Hotel record.
import { itineraryService } from '@modules/itinerary';
import { audit } from '@lib/audit';
import { Errors } from '@lib/errors';
import { assertCan } from '@lib/rbac';
import {
  computeBaseCostMinor,
  computeSellingPriceMinor,
  perSeatPriceMinor,
  type ActivityFeeView,
  type BookingCostBreakdownView,
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
  type SaveBookingCostBreakdownInput,
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

interface ResolvedLineItem {
  foodBeverageRateId?: string;
  activityFeeId?: string;
  quantityPerPerson: number;
  perUnitMinor: number | null;
  currency: Currency | null;
}

interface ResolvedRates {
  driverRate: StaffRateView | null;
  guideRate: StaffRateView | null;
  photographerRate: StaffRateView | null;
  videographerRate: StaffRateView | null;
  breakfastRate: FoodBeverageRateView | null;
  lunchRate: FoodBeverageRateView | null;
  dinnerRate: FoodBeverageRateView | null;
  hotelRate: HotelRateView | null;
  transportRate: TransportRateView | null;
  immigrationCostRate: ImmigrationCostRateView | null;
  lineItems: ResolvedLineItem[];
}

interface RateResolutionInput {
  country: string;
  driverDays: number;
  guideDays: number;
  photographerDays: number;
  videographerDays: number;
  breakfastCount: number;
  lunchCount: number;
  dinnerCount: number;
  hotelRateId?: string;
  transportRateId?: string;
  requiresVisa: boolean;
  immigrationCostRateId?: string;
  lineItems: Array<{ foodBeverageRateId?: string; activityFeeId?: string; quantityPerPerson: number }>;
}

/** Shared by saveCostBreakdown (package) and saveBookingCostBreakdown
 * (booking) -- purely resolves every referenced rate against `country`,
 * never throws. Each caller keeps its own not-found/no-effective-rate
 * checks so error wording (and which fields are even required) can differ
 * between the two flows. */
async function resolveRatesForCost(input: RateResolutionInput, now: Date): Promise<ResolvedRates> {
  const [driverRate, guideRate, photographerRate, videographerRate, breakfastRate, lunchRate, dinnerRate] = await Promise.all([
    input.driverDays > 0 ? financeRepository.findEffectiveStaffRate(input.country, 'DRIVER', now) : Promise.resolve(null),
    input.guideDays > 0 ? financeRepository.findEffectiveStaffRate(input.country, 'GUIDE', now) : Promise.resolve(null),
    input.photographerDays > 0 ? financeRepository.findEffectiveStaffRate(input.country, 'PHOTOGRAPHER', now) : Promise.resolve(null),
    input.videographerDays > 0 ? financeRepository.findEffectiveStaffRate(input.country, 'VIDEOGRAPHER', now) : Promise.resolve(null),
    input.breakfastCount > 0 ? financeRepository.findEffectiveFoodBeverageRate(input.country, 'BREAKFAST', now) : Promise.resolve(null),
    input.lunchCount > 0 ? financeRepository.findEffectiveFoodBeverageRate(input.country, 'LUNCH', now) : Promise.resolve(null),
    input.dinnerCount > 0 ? financeRepository.findEffectiveFoodBeverageRate(input.country, 'DINNER', now) : Promise.resolve(null),
  ]);

  const hotelRate = input.hotelRateId ? await financeRepository.findHotelRateById(input.hotelRateId) : null;
  const transportRate = input.transportRateId ? await financeRepository.findTransportRateById(input.transportRateId) : null;
  const immigrationCostRate =
    input.requiresVisa && input.immigrationCostRateId ? await financeRepository.findImmigrationCostRateById(input.immigrationCostRateId) : null;

  const foodBeverageIds = input.lineItems.map((li) => li.foodBeverageRateId).filter((id): id is string => id != null);
  const activityIds = input.lineItems.map((li) => li.activityFeeId).filter((id): id is string => id != null);
  const [foodBeverageRates, activityFees] = await Promise.all([
    financeRepository.findFoodBeverageRatesByIds(foodBeverageIds),
    financeRepository.findActivityFeesByIds(activityIds),
  ]);
  const foodBeverageById = new Map(foodBeverageRates.map((r) => [r.id, r]));
  const activityFeeById = new Map(activityFees.map((r) => [r.id, r]));

  const lineItems: ResolvedLineItem[] = input.lineItems.map((li) => {
    const rate = li.foodBeverageRateId ? foodBeverageById.get(li.foodBeverageRateId) : activityFeeById.get(li.activityFeeId as string);
    return {
      foodBeverageRateId: li.foodBeverageRateId,
      activityFeeId: li.activityFeeId,
      quantityPerPerson: li.quantityPerPerson,
      perUnitMinor: rate ? ('perUnitMinor' in rate ? rate.perUnitMinor : rate.feeMinor) : null,
      currency: rate?.currency ?? null,
    };
  });

  return { driverRate, guideRate, photographerRate, videographerRate, breakfastRate, lunchRate, dinnerRate, hotelRate, transportRate, immigrationCostRate, lineItems };
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
    // DR-116: confirms the hotelId is real and belongs to the caller's own
    // org before pricing it -- itineraryService.getHotel 404s otherwise.
    await itineraryService.getHotel(ctx, input.hotelId);
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
    // DR-116: confirms the activityId is real and belongs to the caller's
    // own org, and derives `name` from it -- itineraryService.getActivity
    // 404s otherwise.
    const activity = await itineraryService.getActivity(ctx, input.activityId);
    const fee = await financeRepository.createActivityFee({ ...input, name: activity.name });
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

    const { driverRate, guideRate, photographerRate, videographerRate, breakfastRate, lunchRate, dinnerRate, hotelRate, transportRate, immigrationCostRate, lineItems: resolvedLineItems } =
      await resolveRatesForCost(
        {
          country: pkg.country,
          driverDays: input.driverDays,
          guideDays: input.guideDays,
          photographerDays: input.photographerDays,
          videographerDays: input.videographerDays,
          breakfastCount: input.breakfastCount,
          lunchCount: input.lunchCount,
          dinnerCount: input.dinnerCount,
          hotelRateId: input.hotelRateId,
          transportRateId: input.transportRateId,
          requiresVisa: input.requiresVisa,
          immigrationCostRateId: input.immigrationCostRateId,
          lineItems: input.lineItems,
        },
        now,
      );

    if (input.driverDays > 0 && !driverRate) throw Errors.conflict(`No effective driver rate configured for ${pkg.country}`);
    if (input.guideDays > 0 && !guideRate) throw Errors.conflict(`No effective guide rate configured for ${pkg.country}`);
    if (input.photographerDays > 0 && !photographerRate) throw Errors.conflict(`No effective photographer rate configured for ${pkg.country}`);
    if (input.videographerDays > 0 && !videographerRate) throw Errors.conflict(`No effective videographer rate configured for ${pkg.country}`);
    if (input.breakfastCount > 0 && !breakfastRate) throw Errors.conflict(`No effective breakfast rate configured for ${pkg.country}`);
    if (input.lunchCount > 0 && !lunchRate) throw Errors.conflict(`No effective lunch rate configured for ${pkg.country}`);
    if (input.dinnerCount > 0 && !dinnerRate) throw Errors.conflict(`No effective dinner rate configured for ${pkg.country}`);
    if (input.hotelRateId && !hotelRate) throw Errors.notFound('Hotel rate not found');
    if (input.transportRateId && !transportRate) throw Errors.notFound('Transport rate not found');
    if (input.requiresVisa && input.immigrationCostRateId && !immigrationCostRate) throw Errors.notFound('Immigration cost rate not found');

    const lineItems = resolvedLineItems.map((li) => {
      if (li.perUnitMinor == null) throw Errors.notFound('A referenced drink/activity rate was not found');
      return { perUnitMinor: li.perUnitMinor, quantityPerPerson: li.quantityPerPerson };
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

  // ---------------------------------------------------- booking cost breakdown

  /** Same viewers as who can send a quotation -- booking.confirm, no new
   * permission. */
  async getBookingCostBreakdown(ctx: AuthContext, bookingId: string): Promise<BookingCostBreakdownView | null> {
    assertCan(ctx, 'booking.confirm');
    const organizationId = requireOrg(ctx);
    await bookingService.getById(ctx, bookingId); // 404s if not found/visible (anti-BOLA inherited)
    return financeRepository.findBreakdownForBooking(organizationId, bookingId);
  },

  /** Same shape as saveCostBreakdown, adapted for a TAILOR_MADE booking:
   * currency is derived (from whichever rates/add-ons actually resolve),
   * not caller-supplied; referenceGroupSize is the booking's own seat count,
   * no per-seat division (Booking.priceMinor is a whole-booking total,
   * unlike TourPackage.priceMinor); the already-selected add-ons' total is
   * folded into the suggested price. Does NOT write Booking.priceMinor/
   * currency or send the quotation -- this only computes and persists a
   * suggestion; sendQuotation (unchanged) is the actual commit step. */
  async saveBookingCostBreakdown(ctx: AuthContext, bookingId: string, input: SaveBookingCostBreakdownInput): Promise<BookingCostBreakdownView> {
    assertCan(ctx, 'booking.confirm');
    const organizationId = requireOrg(ctx);
    const booking = await bookingService.getById(ctx, bookingId); // 404s if not found/visible
    if (isBookingLocked(booking.status)) {
      throw Errors.conflict(`This booking is ${booking.status} and can no longer be edited`);
    }

    if (booking.origin !== 'TAILOR_MADE') throw Errors.conflict('Only a tailor-made request can have a cost breakdown');
    if (!booking.customCountry) throw Errors.conflict('This booking has no destination country to price against');

    const now = new Date();
    const country = booking.customCountry;

    const {
      driverRate,
      guideRate,
      photographerRate,
      videographerRate,
      breakfastRate,
      lunchRate,
      dinnerRate,
      hotelRate,
      transportRate,
      immigrationCostRate,
      lineItems: resolvedLineItems,
    } = await resolveRatesForCost(
      {
        country,
        driverDays: input.driverDays,
        guideDays: input.guideDays,
        photographerDays: input.photographerDays,
        videographerDays: input.videographerDays,
        breakfastCount: input.breakfastCount,
        lunchCount: input.lunchCount,
        dinnerCount: input.dinnerCount,
        hotelRateId: input.hotelRateId,
        transportRateId: input.transportRateId,
        requiresVisa: input.requiresVisa,
        immigrationCostRateId: input.immigrationCostRateId,
        lineItems: input.lineItems,
      },
      now,
    );

    if (input.driverDays > 0 && !driverRate) throw Errors.conflict(`No effective driver rate configured for ${country}`);
    if (input.guideDays > 0 && !guideRate) throw Errors.conflict(`No effective guide rate configured for ${country}`);
    if (input.photographerDays > 0 && !photographerRate) throw Errors.conflict(`No effective photographer rate configured for ${country}`);
    if (input.videographerDays > 0 && !videographerRate) throw Errors.conflict(`No effective videographer rate configured for ${country}`);
    if (input.breakfastCount > 0 && !breakfastRate) throw Errors.conflict(`No effective breakfast rate configured for ${country}`);
    if (input.lunchCount > 0 && !lunchRate) throw Errors.conflict(`No effective lunch rate configured for ${country}`);
    if (input.dinnerCount > 0 && !dinnerRate) throw Errors.conflict(`No effective dinner rate configured for ${country}`);
    if (input.hotelRateId && !hotelRate) throw Errors.notFound('Hotel rate not found');
    if (input.transportRateId && !transportRate) throw Errors.notFound('Transport rate not found');
    if (input.requiresVisa && input.immigrationCostRateId && !immigrationCostRate) throw Errors.notFound('Immigration cost rate not found');

    const lineItems = resolvedLineItems.map((li) => {
      if (li.perUnitMinor == null) throw Errors.notFound('A referenced drink/activity rate was not found');
      return { perUnitMinor: li.perUnitMinor, quantityPerPerson: li.quantityPerPerson };
    });

    // Derive currency from every resolved rate that actually has one --
    // including each line item's own underlying rate, not just the three
    // "category" rates a first pass would reach for.
    const rateCurrencies = [
      driverRate?.currency,
      guideRate?.currency,
      photographerRate?.currency,
      videographerRate?.currency,
      breakfastRate?.currency,
      lunchRate?.currency,
      dinnerRate?.currency,
      hotelRate?.currency,
      transportRate?.currency,
      immigrationCostRate?.currency,
      ...resolvedLineItems.map((li) => li.currency ?? undefined),
    ].filter((c): c is Currency => c != null);
    const distinctRateCurrencies = new Set(rateCurrencies);
    if (distinctRateCurrencies.size > 1) {
      throw Errors.conflict(`The selected rates are priced in different currencies (${[...distinctRateCurrencies].join(', ')}) -- pick rates that share one currency`);
    }
    let currency: Currency | null = rateCurrencies[0] ?? null;

    const addons = await bookingService.listAddons(ctx, bookingId);
    const addonsTotalMinor = addons.reduce((sum, a) => sum + a.priceMinor, 0);
    const addonCurrencies = new Set(addons.map((a) => a.currency));

    if (currency && addonCurrencies.size > 0 && (addonCurrencies.size > 1 || !addonCurrencies.has(currency))) {
      throw Errors.conflict('The selected add-ons currency does not match the selected rates currency');
    }
    if (!currency) {
      if (addonCurrencies.size > 1) throw Errors.conflict('Selected add-ons must share one currency');
      currency = [...addonCurrencies][0] ?? null;
    }
    // A bare override with no cost context anywhere has nothing to attach a
    // Currency column to -- staff wanting a fully hand-typed number should
    // use the plain sendQuotation form directly instead of this feature.
    if (!currency) throw Errors.conflict('Cannot determine a currency -- select at least one rate or add-on before saving a cost breakdown');

    const baseCostMinor = computeBaseCostMinor({
      referenceGroupSize: booking.seats,
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
    const finalPriceMinor = input.overridePriceMinor ?? sellingPriceTotalMinor + addonsTotalMinor;

    const breakdown = await financeRepository.upsertBookingBreakdown(
      organizationId,
      bookingId,
      {
        currency,
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
        addonsTotalMinor,
        overridePriceMinor: input.overridePriceMinor ?? null,
        overrideReason: input.overrideReason ?? null,
        overriddenByUserId: input.overridePriceMinor != null ? ctx.userId : null,
        overriddenAt: input.overridePriceMinor != null ? now : null,
      },
      input.lineItems.map((li) => ({ foodBeverageRateId: li.foodBeverageRateId, activityFeeId: li.activityFeeId, quantityPerPerson: li.quantityPerPerson })),
    );

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: input.overridePriceMinor != null ? 'finance.booking_price_overridden' : 'finance.booking_cost_breakdown_saved',
      resourceType: 'Booking',
      resourceId: bookingId,
      organizationId,
      metadata: {
        previousBookingPriceMinor: booking.priceMinor ?? null,
        computedPriceMinor: sellingPriceTotalMinor + addonsTotalMinor,
        finalPriceMinor,
        ...(input.overridePriceMinor != null ? { reason: input.overrideReason } : {}),
      },
    });

    return breakdown;
  },
};

// finance module — service. Business logic; orchestrates repository + rbac
// + the pure cost-computation rules. Callable by other modules ONLY
// through index.ts (module boundary rule).
import type { Currency } from '@prisma/client';
import type { AuthContext } from '@modules/auth';
import { bookingService, isBookingLocked } from '@modules/booking';
import { catalogService, type PackageItineraryDayView } from '@modules/catalog';
// DR-116: new finance -> itinerary dependency (confirmed acyclic -- itinerary
// only imports {auth, assignment, booking, catalog}, never finance) so the
// Accommodation operational-rate rows can reference a real Hotel record.
import { itineraryService } from '@modules/itinerary';
import { audit } from '@lib/audit';
import { Errors } from '@lib/errors';
import { getEffectivePlatformRate } from '@lib/platform-rate';
import { applyTaxAndPlatformFee, impliedSubtotalMinor } from '@lib/pricing';
import { assertCan } from '@lib/rbac';
import { getEffectiveTaxRate } from '@lib/tax';
import {
  renderPackageSummaryPdf,
  type PackageSummaryPdfAccommodationRow,
  type PackageSummaryPdfDay,
  type PdfLocale,
} from './package-summary-pdf';
import {
  computeBaseCostMinor,
  computeCostBuckets,
  computeSellingPriceMinor,
  perSeatPriceMinor,
  type ActivityFeeView,
  type AddonRateView,
  type AdminCostRateView,
  type BookingCostBreakdownView,
  type CreateActivityFeeInput,
  type CreateAddonRateInput,
  type CreateAdminCostRateInput,
  type CreateFoodBeverageRateInput,
  type CreateHotelRateInput,
  type CreateImmigrationCostRateInput,
  type CreateRestaurantRateInput,
  type CreateStaffRateInput,
  type CreateTransportRateInput,
  type FoodBeverageRateView,
  type HotelRateView,
  type ImmigrationCostRateView,
  type PackageCostBreakdownView,
  type RestaurantRateView,
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

interface ResolvedDrinkLineItem {
  foodBeverageRateId: string;
  quantityPerPerson: number;
  perUnitMinor: number | null;
  currency: Currency | null;
}

interface ResolvedRates {
  driverRate: StaffRateView | null;
  guideRate: StaffRateView | null;
  photographerRate: StaffRateView | null;
  videographerRate: StaffRateView | null;
  transportRate: TransportRateView | null;
  immigrationCostRate: ImmigrationCostRateView | null;
  adminCostRate: AdminCostRateView | null;
  drinkLineItems: ResolvedDrinkLineItem[];
  // DR-131: one resolved rate per Day Template day that has the
  // corresponding entity assigned, plus the day numbers where one was
  // assigned but no effective rate resolved (the caller throws for those --
  // this function stays a pure "resolve, never throw" helper, same
  // convention as every other field above).
  accommodationDailyRatesMinor: number[];
  restaurantDailyRatesMinor: number[];
  activityFeesMinor: number[];
  templateCurrencies: Currency[];
  unresolvedHotelDayNumbers: number[];
  unresolvedRestaurantDayNumbers: number[];
  unresolvedActivityDayNumbers: number[];
}

interface RateResolutionInput {
  country: string;
  driverDays: number;
  guideDays: number;
  photographerDays: number;
  videographerDays: number;
  transportRateId?: string;
  requiresVisa: boolean;
  immigrationCostRateId?: string;
  adminDays: number;
  drinkLineItems: Array<{ foodBeverageRateId: string; quantityPerPerson: number }>;
  // The package's (or, for a booking, its linked customized package's) own
  // Day Template -- empty if there isn't one yet.
  templateDays: Pick<PackageItineraryDayView, 'dayNumber' | 'hotelId' | 'restaurantId' | 'activityIds'>[];
}

/** Shared by saveCostBreakdown (package) and saveBookingCostBreakdown
 * (booking) -- purely resolves every referenced rate against `country`,
 * never throws. Each caller keeps its own not-found/no-effective-rate
 * checks so error wording (and which fields are even required) can differ
 * between the two flows. */
async function resolveRatesForCost(input: RateResolutionInput, now: Date): Promise<ResolvedRates> {
  const [driverRate, guideRate, photographerRate, videographerRate, adminCostRate] = await Promise.all([
    input.driverDays > 0 ? financeRepository.findEffectiveStaffRate(input.country, 'DRIVER', now) : Promise.resolve(null),
    input.guideDays > 0 ? financeRepository.findEffectiveStaffRate(input.country, 'GUIDE', now) : Promise.resolve(null),
    input.photographerDays > 0 ? financeRepository.findEffectiveStaffRate(input.country, 'PHOTOGRAPHER', now) : Promise.resolve(null),
    input.videographerDays > 0 ? financeRepository.findEffectiveStaffRate(input.country, 'VIDEOGRAPHER', now) : Promise.resolve(null),
    input.adminDays > 0 ? financeRepository.findEffectiveAdminCostRate(input.country, now) : Promise.resolve(null),
  ]);

  const transportRate = input.transportRateId ? await financeRepository.findTransportRateById(input.transportRateId) : null;
  const immigrationCostRate =
    input.requiresVisa && input.immigrationCostRateId ? await financeRepository.findImmigrationCostRateById(input.immigrationCostRateId) : null;

  const foodBeverageIds = input.drinkLineItems.map((li) => li.foodBeverageRateId);
  const foodBeverageRates = await financeRepository.findFoodBeverageRatesByIds(foodBeverageIds);
  const foodBeverageById = new Map(foodBeverageRates.map((r) => [r.id, r]));
  const drinkLineItems: ResolvedDrinkLineItem[] = input.drinkLineItems.map((li) => {
    const rate = foodBeverageById.get(li.foodBeverageRateId);
    return { foodBeverageRateId: li.foodBeverageRateId, quantityPerPerson: li.quantityPerPerson, perUnitMinor: rate?.perUnitMinor ?? null, currency: rate?.currency ?? null };
  });

  // DR-131: per-day Day Template resolution -- accommodation/restaurant/
  // activities are no longer staff-picked, they're read straight off
  // whatever hotel/restaurant/activities are assigned per day.
  const hotelIds = [...new Set(input.templateDays.map((d) => d.hotelId).filter((id): id is string => id != null))];
  const restaurantIds = [...new Set(input.templateDays.map((d) => d.restaurantId).filter((id): id is string => id != null))];
  const activityIds = [...new Set(input.templateDays.flatMap((d) => d.activityIds))];

  const [hotelRates, restaurantRates, activityFeeRates] = await Promise.all([
    Promise.all(hotelIds.map((id) => financeRepository.findEffectiveHotelRateForHotel(id, now))),
    Promise.all(restaurantIds.map((id) => financeRepository.findEffectiveRestaurantRateForRestaurant(id, now))),
    Promise.all(activityIds.map((id) => financeRepository.findEffectiveActivityFeeForActivity(id, now))),
  ]);
  const hotelRateByHotelId = new Map(hotelIds.map((id, i) => [id, hotelRates[i]]));
  const restaurantRateByRestaurantId = new Map(restaurantIds.map((id, i) => [id, restaurantRates[i]]));
  const activityFeeByActivityId = new Map(activityIds.map((id, i) => [id, activityFeeRates[i]]));

  const accommodationDailyRatesMinor: number[] = [];
  const restaurantDailyRatesMinor: number[] = [];
  const activityFeesMinor: number[] = [];
  const templateCurrencies: Currency[] = [];
  const unresolvedHotelDayNumbers: number[] = [];
  const unresolvedRestaurantDayNumbers: number[] = [];
  const unresolvedActivityDayNumbers: number[] = [];

  for (const day of input.templateDays) {
    if (day.hotelId) {
      const rate = hotelRateByHotelId.get(day.hotelId);
      if (rate) {
        accommodationDailyRatesMinor.push(rate.nightlyRateMinor);
        templateCurrencies.push(rate.currency);
      } else {
        unresolvedHotelDayNumbers.push(day.dayNumber);
      }
    }
    if (day.restaurantId) {
      const rate = restaurantRateByRestaurantId.get(day.restaurantId);
      if (rate) {
        restaurantDailyRatesMinor.push(rate.dailyRateMinor);
        templateCurrencies.push(rate.currency);
      } else {
        unresolvedRestaurantDayNumbers.push(day.dayNumber);
      }
    }
    for (const activityId of day.activityIds) {
      const fee = activityFeeByActivityId.get(activityId);
      if (fee) {
        activityFeesMinor.push(fee.feeMinor);
        templateCurrencies.push(fee.currency);
      } else if (!unresolvedActivityDayNumbers.includes(day.dayNumber)) {
        unresolvedActivityDayNumbers.push(day.dayNumber);
      }
    }
  }

  return {
    driverRate,
    guideRate,
    photographerRate,
    videographerRate,
    transportRate,
    immigrationCostRate,
    adminCostRate,
    drinkLineItems,
    accommodationDailyRatesMinor,
    restaurantDailyRatesMinor,
    activityFeesMinor,
    templateCurrencies,
    unresolvedHotelDayNumbers,
    unresolvedRestaurantDayNumbers,
    unresolvedActivityDayNumbers,
  };
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

  // -------------------------------------------------------- RestaurantRate
  async listRestaurantRates(ctx: AuthContext): Promise<RestaurantRateView[]> {
    assertCan(ctx, 'finance_config.read');
    return financeRepository.listRestaurantRates();
  },
  async createRestaurantRate(ctx: AuthContext, input: CreateRestaurantRateInput): Promise<RestaurantRateView> {
    requireRateWriter(ctx);
    // DR-131: confirms the restaurantId is real and belongs to the caller's
    // own org before pricing it -- itineraryService.getRestaurant 404s
    // otherwise. Same precedent as createHotelRate's getHotel check.
    await itineraryService.getRestaurant(ctx, input.restaurantId);
    const rate = await financeRepository.createRestaurantRate(input);
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'finance.restaurant_rate_created', resourceType: 'RestaurantRate', resourceId: rate.id });
    return rate;
  },
  async deleteRestaurantRate(ctx: AuthContext, id: string): Promise<void> {
    requireRateWriter(ctx);
    const deleted = await financeRepository.deleteRestaurantRate(id);
    if (!deleted) throw Errors.notFound('Restaurant rate not found');
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'finance.restaurant_rate_deleted', resourceType: 'RestaurantRate', resourceId: id });
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

  // -------------------------------------------------------------- AdminCostRate
  async listAdminCostRates(ctx: AuthContext): Promise<AdminCostRateView[]> {
    assertCan(ctx, 'finance_config.read');
    return financeRepository.listAdminCostRates();
  },
  async createAdminCostRate(ctx: AuthContext, input: CreateAdminCostRateInput): Promise<AdminCostRateView> {
    requireRateWriter(ctx);
    const rate = await financeRepository.createAdminCostRate(input);
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'finance.admin_cost_rate_created', resourceType: 'AdminCostRate', resourceId: rate.id });
    return rate;
  },
  async deleteAdminCostRate(ctx: AuthContext, id: string): Promise<void> {
    requireRateWriter(ctx);
    const deleted = await financeRepository.deleteAdminCostRate(id);
    if (!deleted) throw Errors.notFound('Admin cost rate not found');
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'finance.admin_cost_rate_deleted', resourceType: 'AdminCostRate', resourceId: id });
  },

  // -------------------------------------------------------------- AddonRate
  // Staff CRUD only, same as every other rate table -- the actual
  // resolve-for-pricing read is src/lib/addon-rates.ts, not this service
  // (guest checkout has no AuthContext holding finance_config.read).
  async listAddonRates(ctx: AuthContext): Promise<AddonRateView[]> {
    assertCan(ctx, 'finance_config.read');
    return financeRepository.listAddonRates();
  },
  async createAddonRate(ctx: AuthContext, input: CreateAddonRateInput): Promise<AddonRateView> {
    requireRateWriter(ctx);
    const rate = await financeRepository.createAddonRate(input);
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'finance.addon_rate_created', resourceType: 'AddonRate', resourceId: rate.id });
    return rate;
  },
  async deleteAddonRate(ctx: AuthContext, id: string): Promise<void> {
    requireRateWriter(ctx);
    const deleted = await financeRepository.deleteAddonRate(id);
    if (!deleted) throw Errors.notFound('Addon rate not found');
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'finance.addon_rate_deleted', resourceType: 'AddonRate', resourceId: id });
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

  /** Explicit user request: one staff-only PDF combining a plain-language
   * cost summary with the package's day-by-day itinerary template,
   * downloadable in English or French, linked from the package detail page.
   * Same viewers as getCostBreakdown (catalog.write, not a new permission).
   * The per-day accommodation table is resolved fresh here (day-by-day
   * hotel/rate attribution was never persisted -- DR-132 only persists the
   * summed bucket) -- a day whose rate can no longer be resolved shows as
   * such rather than failing the whole document. The cost-summary figures
   * always come from the persisted breakdown snapshot (never this fresh
   * resolution) and TourPackage.priceMinor for the grand total, so the
   * printed document can never disagree with what was actually priced. */
  async generatePackageSummaryPdf(ctx: AuthContext, tourPackageId: string, locale: PdfLocale): Promise<{ body: Buffer; contentType: string }> {
    assertCan(ctx, 'catalog.write');
    const organizationId = requireOrg(ctx);
    const pkg = await catalogService.getPackage(ctx, tourPackageId); // 404s if not found/visible

    const breakdown = await financeRepository.findBreakdownForPackage(organizationId, tourPackageId);
    if (!breakdown) throw Errors.conflict('This package has no cost breakdown yet -- save one before downloading a summary');
    if (
      breakdown.computedActivitiesMinor == null ||
      breakdown.computedAdminMinor == null ||
      breakdown.computedTransportMinor == null ||
      breakdown.computedPlatformFeeMinor == null ||
      pkg.priceMinor == null
    ) {
      throw Errors.conflict("This package's cost breakdown predates the current pricing model -- re-save it before downloading a summary");
    }

    const templateDays = await catalogService.listTemplateDays(ctx, tourPackageId);
    const hotelIds = [...new Set(templateDays.map((d) => d.hotelId).filter((id): id is string => id != null))];
    const restaurantIds = [...new Set(templateDays.map((d) => d.restaurantId).filter((id): id is string => id != null))];
    const activityIds = [...new Set(templateDays.flatMap((d) => d.activityIds))];

    const now = new Date();
    const [hotels, restaurants, activities, hotelRates] = await Promise.all([
      hotelIds.length > 0 ? itineraryService.listHotelsByIds(ctx, hotelIds) : Promise.resolve([]),
      restaurantIds.length > 0 ? itineraryService.listRestaurantsByIds(ctx, restaurantIds) : Promise.resolve([]),
      activityIds.length > 0 ? itineraryService.listActivitiesByIds(ctx, activityIds) : Promise.resolve([]),
      Promise.all(hotelIds.map((id) => financeRepository.findEffectiveHotelRateForHotel(id, now))),
    ]);
    const hotelNameById = new Map(hotels.map((h) => [h.id, h.name]));
    const restaurantNameById = new Map(restaurants.map((r) => [r.id, r.name]));
    const activityNameById = new Map(activities.map((a) => [a.id, a.name]));
    const hotelRateByHotelId = new Map(hotelIds.map((id, i) => [id, hotelRates[i]]));

    const days: PackageSummaryPdfDay[] = templateDays.map((d) => {
      const activityNames = d.activityIds.map((id) => activityNameById.get(id)).filter((n): n is string => n != null);
      return {
        dayNumber: d.dayNumber,
        hotelName: d.hotelId ? (hotelNameById.get(d.hotelId) ?? null) : null,
        restaurantName: d.restaurantId ? (restaurantNameById.get(d.restaurantId) ?? null) : null,
        activitiesLabel: activityNames.length > 0 ? activityNames.join(', ') : (d.activities ?? null),
      };
    });

    const accommodationRows: PackageSummaryPdfAccommodationRow[] = templateDays
      .filter((d): d is typeof d & { hotelId: string } => d.hotelId != null)
      .map((d) => ({
        dayNumber: d.dayNumber,
        hotelName: hotelNameById.get(d.hotelId) ?? d.hotelId,
        nightlyRateMinor: hotelRateByHotelId.get(d.hotelId)?.nightlyRateMinor ?? null,
      }));

    const body = await renderPackageSummaryPdf({
      locale,
      currency: pkg.currency,
      title: pkg.title,
      packageReference: pkg.packageReference,
      referenceGroupSize: breakdown.referenceGroupSize,
      priceMinor: pkg.priceMinor,
      computedActivitiesMinor: breakdown.computedActivitiesMinor,
      computedAdminMinor: breakdown.computedAdminMinor,
      computedTransportMinor: breakdown.computedTransportMinor,
      computedPlatformFeeMinor: breakdown.computedPlatformFeeMinor,
      days,
      accommodationRows,
    });

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'finance.package_summary_pdf_downloaded',
      resourceType: 'TourPackage',
      resourceId: tourPackageId,
      organizationId,
    });

    return { body, contentType: 'application/pdf' };
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
    // DR-131: accommodation/restaurant/activities are read straight from
    // this package's own Day Template -- no manual hotel/restaurant/
    // activity picking on this form anymore.
    const templateDays = await catalogService.listTemplateDays(ctx, tourPackageId);

    const {
      driverRate,
      guideRate,
      photographerRate,
      videographerRate,
      transportRate,
      immigrationCostRate,
      adminCostRate,
      drinkLineItems: resolvedDrinkLineItems,
      accommodationDailyRatesMinor,
      restaurantDailyRatesMinor,
      activityFeesMinor,
      templateCurrencies,
      unresolvedHotelDayNumbers,
      unresolvedRestaurantDayNumbers,
      unresolvedActivityDayNumbers,
    } = await resolveRatesForCost(
      {
        country: pkg.country,
        driverDays: input.driverDays,
        guideDays: input.guideDays,
        photographerDays: input.photographerDays,
        videographerDays: input.videographerDays,
        transportRateId: input.transportRateId,
        requiresVisa: input.requiresVisa,
        immigrationCostRateId: input.immigrationCostRateId,
        adminDays: input.adminDays,
        drinkLineItems: input.drinkLineItems,
        templateDays,
      },
      now,
    );

    if (input.driverDays > 0 && !driverRate) throw Errors.conflict(`No effective driver rate configured for ${pkg.country}`);
    if (input.guideDays > 0 && !guideRate) throw Errors.conflict(`No effective guide rate configured for ${pkg.country}`);
    if (input.photographerDays > 0 && !photographerRate) throw Errors.conflict(`No effective photographer rate configured for ${pkg.country}`);
    if (input.videographerDays > 0 && !videographerRate) throw Errors.conflict(`No effective videographer rate configured for ${pkg.country}`);
    if (input.transportRateId && !transportRate) throw Errors.notFound('Transport rate not found');
    if (input.requiresVisa && input.immigrationCostRateId && !immigrationCostRate) throw Errors.notFound('Immigration cost rate not found');
    if (input.adminDays > 0 && !adminCostRate) throw Errors.conflict(`No effective admin cost rate configured for ${pkg.country}`);
    if (unresolvedHotelDayNumbers.length > 0) {
      throw Errors.conflict(`No effective hotel rate configured for the hotel assigned on day(s) ${unresolvedHotelDayNumbers.join(', ')}`);
    }
    if (unresolvedRestaurantDayNumbers.length > 0) {
      throw Errors.conflict(`No effective restaurant rate configured for the restaurant assigned on day(s) ${unresolvedRestaurantDayNumbers.join(', ')}`);
    }
    if (unresolvedActivityDayNumbers.length > 0) {
      throw Errors.conflict(`No effective activity fee configured for an activity assigned on day(s) ${unresolvedActivityDayNumbers.join(', ')}`);
    }
    if (templateCurrencies.some((c) => c !== pkg.currency)) {
      throw Errors.conflict(
        `The resolved hotel/restaurant/activity rates for this package's Day Template are priced in a different currency than the package (${pkg.currency})`,
      );
    }

    const drinkLineItems = resolvedDrinkLineItems.map((li) => {
      if (li.perUnitMinor == null) throw Errors.notFound('A referenced drink rate was not found');
      return { foodBeverageRateId: li.foodBeverageRateId, perUnitMinor: li.perUnitMinor, quantityPerPerson: li.quantityPerPerson };
    });

    const costInputs = {
      referenceGroupSize: input.referenceGroupSize,
      driverDays: input.driverDays,
      guideDays: input.guideDays,
      photographerDays: input.photographerDays,
      videographerDays: input.videographerDays,
      driverDailyRateMinor: driverRate?.dailyRateMinor ?? null,
      guideDailyRateMinor: guideRate?.dailyRateMinor ?? null,
      photographerDailyRateMinor: photographerRate?.dailyRateMinor ?? null,
      videographerDailyRateMinor: videographerRate?.dailyRateMinor ?? null,
      accommodationDailyRatesMinor,
      restaurantDailyRatesMinor,
      activityFeesMinor,
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
      drinkLineItems,
      adminDays: input.adminDays,
      adminDailyRateMinor: adminCostRate?.dailyRateMinor ?? null,
      adminCostBasis: input.adminCostBasis,
    };
    const buckets = computeCostBuckets(costInputs);
    const baseCostMinor = computeBaseCostMinor(costInputs);
    const sellingPriceTotalMinor = computeSellingPriceMinor(baseCostMinor, input.agencyMarginBp);

    // DR-134: fold tax + the platform fee into the package's stored price
    // (explicit user request) -- resolved fresh here, at cost-breakdown-save
    // time, and then snapshotted (see below) so booking/invoicing can trust
    // it later rather than re-resolving live and taxing the guest twice.
    let taxRateBp: number;
    try {
      ({ rateBp: taxRateBp } = await getEffectiveTaxRate(pkg.country, now));
    } catch {
      throw Errors.conflict('No tax rate configured for this country');
    }
    let platformFeeRateBp: number;
    try {
      ({ rateBp: platformFeeRateBp } = await getEffectivePlatformRate(now));
    } catch {
      throw Errors.conflict('No platform rate configured');
    }
    const { taxMinor, platformFeeMinor, totalMinor } = applyTaxAndPlatformFee(sellingPriceTotalMinor, input.currency, taxRateBp, platformFeeRateBp);

    const computedPerSeatSubtotal = perSeatPriceMinor(sellingPriceTotalMinor, input.referenceGroupSize);
    const computedPerSeatTotal = perSeatPriceMinor(totalMinor, input.referenceGroupSize);
    // An override now replaces the FINAL tax+fee-inclusive per-seat price
    // directly (consistent with priceMinor's new meaning) -- back out an
    // implied subtotal from it using the same resolved rates so booking/
    // invoicing can still skip live re-taxation for an overridden package.
    const finalPriceMinor = input.overridePriceMinor ?? computedPerSeatTotal;
    const finalPerSeatSubtotal = input.overridePriceMinor != null ? impliedSubtotalMinor(input.overridePriceMinor, taxRateBp, platformFeeRateBp) : computedPerSeatSubtotal;

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
        transportRateId: input.transportRateId ?? null,
        transportDays: input.transportDays,
        requiresVisa: input.requiresVisa,
        immigrationCostRateId: input.immigrationCostRateId ?? null,
        adminDays: input.adminDays,
        adminCostBasis: input.adminCostBasis,
        agencyMarginBp: input.agencyMarginBp,
        computedAccommodationMinor: buckets.accommodationMinor,
        computedRestaurantMinor: buckets.restaurantMinor,
        computedActivitiesMinor: buckets.activitiesMinor,
        computedTransportMinor: buckets.transportMinor,
        computedAdminMinor: buckets.adminMinor,
        computedBaseCostMinor: baseCostMinor,
        computedSellingPriceMinor: sellingPriceTotalMinor,
        computedTaxMinor: taxMinor,
        computedPlatformFeeMinor: platformFeeMinor,
        computedTotalMinor: totalMinor,
        taxRateBpSnapshot: taxRateBp,
        platformFeeRateBpSnapshot: platformFeeRateBp,
        overridePriceMinor: input.overridePriceMinor ?? null,
        overrideReason: input.overrideReason ?? null,
        overriddenByUserId: input.overridePriceMinor != null ? ctx.userId : null,
        overriddenAt: input.overridePriceMinor != null ? now : null,
      },
      input.drinkLineItems.map((li) => ({ foodBeverageRateId: li.foodBeverageRateId, quantityPerPerson: li.quantityPerPerson })),
    );

    await catalogService.setComputedPrice(ctx, tourPackageId, {
      priceMinor: finalPriceMinor,
      priceSubtotalMinor: finalPerSeatSubtotal,
      priceTaxRateBp: taxRateBp,
      pricePlatformFeeRateBp: platformFeeRateBp,
    });

    if (input.overridePriceMinor != null) {
      await audit({
        actorUserId: ctx.userId,
        actorRole: ctx.roles[0],
        action: 'finance.price_overridden',
        resourceType: 'TourPackage',
        resourceId: tourPackageId,
        organizationId,
        metadata: { previousPriceMinor: pkg.priceMinor, computedPriceMinor: computedPerSeatTotal, overridePriceMinor: finalPriceMinor, reason: input.overrideReason },
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
    // DR-131: same Day-Template-derived accommodation/restaurant/activities
    // as the package flow, sourced from this booking's linked customized
    // package (Booking.customizedPackageId, DR-108) if one exists yet --
    // empty (all three buckets 0, not an error) otherwise. Uses the no-ctx
    // cross-module read (same "caller already gates" convention as
    // itineraryService.createItinerary's own template-copy step) rather
    // than catalogService.listTemplateDays, since this ctx only guarantees
    // booking.confirm, not catalog.read.
    const templateDays = booking.customizedPackageId
      ? await catalogService.listTemplateDaysForItineraryCopy(organizationId, booking.customizedPackageId)
      : [];

    const {
      driverRate,
      guideRate,
      photographerRate,
      videographerRate,
      transportRate,
      immigrationCostRate,
      adminCostRate,
      drinkLineItems: resolvedDrinkLineItems,
      accommodationDailyRatesMinor,
      restaurantDailyRatesMinor,
      activityFeesMinor,
      templateCurrencies,
      unresolvedHotelDayNumbers,
      unresolvedRestaurantDayNumbers,
      unresolvedActivityDayNumbers,
    } = await resolveRatesForCost(
      {
        country,
        driverDays: input.driverDays,
        guideDays: input.guideDays,
        photographerDays: input.photographerDays,
        videographerDays: input.videographerDays,
        transportRateId: input.transportRateId,
        requiresVisa: input.requiresVisa,
        immigrationCostRateId: input.immigrationCostRateId,
        adminDays: input.adminDays,
        drinkLineItems: input.drinkLineItems,
        templateDays,
      },
      now,
    );

    if (input.driverDays > 0 && !driverRate) throw Errors.conflict(`No effective driver rate configured for ${country}`);
    if (input.guideDays > 0 && !guideRate) throw Errors.conflict(`No effective guide rate configured for ${country}`);
    if (input.photographerDays > 0 && !photographerRate) throw Errors.conflict(`No effective photographer rate configured for ${country}`);
    if (input.videographerDays > 0 && !videographerRate) throw Errors.conflict(`No effective videographer rate configured for ${country}`);
    if (input.transportRateId && !transportRate) throw Errors.notFound('Transport rate not found');
    if (input.requiresVisa && input.immigrationCostRateId && !immigrationCostRate) throw Errors.notFound('Immigration cost rate not found');
    if (input.adminDays > 0 && !adminCostRate) throw Errors.conflict(`No effective admin cost rate configured for ${country}`);
    if (unresolvedHotelDayNumbers.length > 0) {
      throw Errors.conflict(`No effective hotel rate configured for the hotel assigned on day(s) ${unresolvedHotelDayNumbers.join(', ')}`);
    }
    if (unresolvedRestaurantDayNumbers.length > 0) {
      throw Errors.conflict(`No effective restaurant rate configured for the restaurant assigned on day(s) ${unresolvedRestaurantDayNumbers.join(', ')}`);
    }
    if (unresolvedActivityDayNumbers.length > 0) {
      throw Errors.conflict(`No effective activity fee configured for an activity assigned on day(s) ${unresolvedActivityDayNumbers.join(', ')}`);
    }

    const drinkLineItems = resolvedDrinkLineItems.map((li) => {
      if (li.perUnitMinor == null) throw Errors.notFound('A referenced drink rate was not found');
      return { foodBeverageRateId: li.foodBeverageRateId, perUnitMinor: li.perUnitMinor, quantityPerPerson: li.quantityPerPerson };
    });

    // Derive currency from every resolved rate that actually has one --
    // including each line item's own underlying rate and every resolved
    // Day Template rate, not just the "category" rates a first pass would
    // reach for.
    const rateCurrencies = [
      driverRate?.currency,
      guideRate?.currency,
      photographerRate?.currency,
      videographerRate?.currency,
      transportRate?.currency,
      immigrationCostRate?.currency,
      adminCostRate?.currency,
      ...resolvedDrinkLineItems.map((li) => li.currency ?? undefined),
      ...templateCurrencies,
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

    const costInputs = {
      referenceGroupSize: booking.seats,
      driverDays: input.driverDays,
      guideDays: input.guideDays,
      photographerDays: input.photographerDays,
      videographerDays: input.videographerDays,
      driverDailyRateMinor: driverRate?.dailyRateMinor ?? null,
      guideDailyRateMinor: guideRate?.dailyRateMinor ?? null,
      photographerDailyRateMinor: photographerRate?.dailyRateMinor ?? null,
      videographerDailyRateMinor: videographerRate?.dailyRateMinor ?? null,
      accommodationDailyRatesMinor,
      restaurantDailyRatesMinor,
      activityFeesMinor,
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
      drinkLineItems,
      adminDays: input.adminDays,
      adminDailyRateMinor: adminCostRate?.dailyRateMinor ?? null,
      adminCostBasis: input.adminCostBasis,
    };
    const buckets = computeCostBuckets(costInputs);
    const baseCostMinor = computeBaseCostMinor(costInputs);
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
        transportRateId: input.transportRateId ?? null,
        transportDays: input.transportDays,
        requiresVisa: input.requiresVisa,
        immigrationCostRateId: input.immigrationCostRateId ?? null,
        adminDays: input.adminDays,
        adminCostBasis: input.adminCostBasis,
        agencyMarginBp: input.agencyMarginBp,
        computedAccommodationMinor: buckets.accommodationMinor,
        computedRestaurantMinor: buckets.restaurantMinor,
        computedActivitiesMinor: buckets.activitiesMinor,
        computedBaseCostMinor: baseCostMinor,
        computedSellingPriceMinor: sellingPriceTotalMinor,
        addonsTotalMinor,
        overridePriceMinor: input.overridePriceMinor ?? null,
        overrideReason: input.overrideReason ?? null,
        overriddenByUserId: input.overridePriceMinor != null ? ctx.userId : null,
        overriddenAt: input.overridePriceMinor != null ? now : null,
      },
      input.drinkLineItems.map((li) => ({ foodBeverageRateId: li.foodBeverageRateId, quantityPerPerson: li.quantityPerPerson })),
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

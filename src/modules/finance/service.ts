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
import { slugify } from '@lib/slug';
import { getEffectiveTaxRate } from '@lib/tax';
import {
  renderClientPackageSummaryPdf,
  renderPackageSummaryPdf,
  type PackageSummaryPdfAccommodationRow,
  type PackageSummaryPdfDay,
  type PdfLocale,
} from './package-summary-pdf';
import {
  blendedTaxRateBp,
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

/** DR-152: first dynamic Content-Disposition filename in this app (every
 * PDF route before this shipped a fixed literal, e.g. "package-summary.pdf")
 * -- explicit user request that the download carry the package's own name
 * and identifier. Built from `slugify(title)` (already ASCII-only/URL-safe,
 * DR-118's own helper) + `packageReference` (the human "PKG-00034" id shown
 * everywhere else in the staff UI, not the raw UUID) so the whole filename
 * stays plain ASCII with no need for the RFC 5987 filename*= fallback form. */
function buildPackageSummaryPdfFilename(title: string, packageReference: string, locale: PdfLocale, kind: 'staff' | 'client'): string {
  const slug = slugify(title) || 'package';
  return `${slug}-${packageReference}-${kind}-summary-${locale}.pdf`;
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
  const [driverRate, guideRate, adminCostRate] = await Promise.all([
    input.driverDays > 0 ? financeRepository.findEffectiveStaffRate(input.country, 'DRIVER', now) : Promise.resolve(null),
    input.guideDays > 0 ? financeRepository.findEffectiveStaffRate(input.country, 'GUIDE', now) : Promise.resolve(null),
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

/** Explicit user request: a combo package/booking (a Day Template whose
 * hotels span more than one country) is taxed per country instead of at a
 * single flat rate -- weighted by how many Day Template nights each
 * country's hotel covers. `HotelRate.country` (not the package's own
 * `country`/`countries[]`, which are staff-typed and never read by tax/rate
 * resolution, DR-114) is the ground truth for "which country was this
 * night actually in," since it's already keyed to a specific real hotel
 * (DR-131's findEffectiveHotelRateForHotel). Collapses to a single
 * `getEffectiveTaxRate` lookup -- identical to pre-existing behavior -- for
 * a single-country package or one with no hotel-tagged Day Template yet. */
async function computeBlendedTaxRate(
  fallbackCountry: string,
  templateDays: Pick<PackageItineraryDayView, 'hotelId'>[],
  at: Date,
): Promise<{ rateBp: number; countries: string[] }> {
  const hotelIds = [...new Set(templateDays.map((d) => d.hotelId).filter((id): id is string => id != null))];
  const hotelRates = await Promise.all(hotelIds.map((id) => financeRepository.findEffectiveHotelRateForHotel(id, at)));
  const hotelRateByHotelId = new Map(hotelIds.map((id, i) => [id, hotelRates[i]]));

  const nightsByCountry = new Map<string, number>();
  for (const day of templateDays) {
    if (!day.hotelId) continue;
    const rate = hotelRateByHotelId.get(day.hotelId);
    if (!rate) continue;
    nightsByCountry.set(rate.country, (nightsByCountry.get(rate.country) ?? 0) + 1);
  }
  const distinctCountries = [...nightsByCountry.keys()];

  if (distinctCountries.length <= 1) {
    const { rateBp } = await getEffectiveTaxRate(fallbackCountry, at);
    return { rateBp, countries: distinctCountries.length === 1 ? distinctCountries : [fallbackCountry] };
  }

  const rateEntries = await Promise.all(
    distinctCountries.map(async (country) => [country, (await getEffectiveTaxRate(country, at)).rateBp] as const),
  );
  const rateBpByCountry = new Map(rateEntries);
  const rateBp = blendedTaxRateBp([...nightsByCountry.entries()].map(([country, nights]) => ({ nights, rateBp: rateBpByCountry.get(country)! })));
  return { rateBp, countries: distinctCountries };
}

/** Every field the "reapply rates" sweep needs from an already-persisted
 * PackageCostBreakdownView to replay it through saveCostBreakdown exactly
 * as the staff form itself would submit it -- no new computation, just
 * re-resolving the same referenced rates (now at their current price) and
 * re-saving. `overridePriceMinor`/`overrideReason` are carried through
 * unchanged, which is what keeps a staff override untouched (see
 * saveCostBreakdown's own override handling) while still refreshing the
 * display-only computed*Minor bucket snapshots. */
function toSaveCostBreakdownInput(b: PackageCostBreakdownView): SaveCostBreakdownInput {
  return {
    currency: b.currency,
    referenceGroupSize: b.referenceGroupSize,
    nights: b.nights,
    driverDays: b.driverDays,
    guideDays: b.guideDays,
    transportRateId: b.transportRateId ?? undefined,
    transportDays: b.transportDays,
    requiresVisa: b.requiresVisa,
    immigrationCostRateId: b.immigrationCostRateId ?? undefined,
    adminDays: b.adminDays,
    adminCostBasis: b.adminCostBasis,
    agencyMarginBp: b.agencyMarginBp,
    drinkLineItems: b.drinkLineItems.map((li) => ({ foodBeverageRateId: li.foodBeverageRateId, quantityPerPerson: li.quantityPerPerson })),
    overridePriceMinor: b.overridePriceMinor ?? undefined,
    overrideReason: b.overrideReason ?? undefined,
  };
}

/** Booking counterpart to toSaveCostBreakdownInput -- same replay purpose. */
function toSaveBookingCostBreakdownInput(b: BookingCostBreakdownView): SaveBookingCostBreakdownInput {
  return {
    nights: b.nights,
    driverDays: b.driverDays,
    guideDays: b.guideDays,
    transportRateId: b.transportRateId ?? undefined,
    transportDays: b.transportDays,
    requiresVisa: b.requiresVisa,
    immigrationCostRateId: b.immigrationCostRateId ?? undefined,
    adminDays: b.adminDays,
    adminCostBasis: b.adminCostBasis,
    agencyMarginBp: b.agencyMarginBp,
    drinkLineItems: b.drinkLineItems.map((li) => ({ foodBeverageRateId: li.foodBeverageRateId, quantityPerPerson: li.quantityPerPerson })),
    overridePriceMinor: b.overridePriceMinor ?? undefined,
    overrideReason: b.overrideReason ?? undefined,
  };
}

export interface ReapplyRatesResult {
  packagesUpdated: number;
  packagesSkipped: Array<{ tourPackageId: string; reason: string }>;
  bookingsUpdated: number;
  bookingsSkipped: Array<{ bookingId: string; reason: string }>;
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
  /** Explicit user request: SUPERADMIN can update a rate's price (and its
   * other fields) in place, not just delete-and-recreate it -- and once
   * saved, every existing cost breakdown is recomputed against the new
   * price (see reapplyRatesToAllCostBreakdowns below). */
  async updateStaffRate(ctx: AuthContext, id: string, input: CreateStaffRateInput): Promise<{ rate: StaffRateView; reapply: ReapplyRatesResult }> {
    requireRateWriter(ctx);
    const rate = await financeRepository.updateStaffRate(id, input);
    if (!rate) throw Errors.notFound('Staff rate not found');
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'finance.staff_rate_updated', resourceType: 'StaffRate', resourceId: id });
    const reapply = await financeService.reapplyRatesToAllCostBreakdowns(ctx);
    return { rate, reapply };
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
  async updateHotelRate(ctx: AuthContext, id: string, input: CreateHotelRateInput): Promise<{ rate: HotelRateView; reapply: ReapplyRatesResult }> {
    requireRateWriter(ctx);
    await itineraryService.getHotel(ctx, input.hotelId);
    const rate = await financeRepository.updateHotelRate(id, input);
    if (!rate) throw Errors.notFound('Hotel rate not found');
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'finance.hotel_rate_updated', resourceType: 'HotelRate', resourceId: id });
    const reapply = await financeService.reapplyRatesToAllCostBreakdowns(ctx);
    return { rate, reapply };
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
  async updateRestaurantRate(ctx: AuthContext, id: string, input: CreateRestaurantRateInput): Promise<{ rate: RestaurantRateView; reapply: ReapplyRatesResult }> {
    requireRateWriter(ctx);
    await itineraryService.getRestaurant(ctx, input.restaurantId);
    const rate = await financeRepository.updateRestaurantRate(id, input);
    if (!rate) throw Errors.notFound('Restaurant rate not found');
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'finance.restaurant_rate_updated', resourceType: 'RestaurantRate', resourceId: id });
    const reapply = await financeService.reapplyRatesToAllCostBreakdowns(ctx);
    return { rate, reapply };
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
  async updateTransportRate(ctx: AuthContext, id: string, input: CreateTransportRateInput): Promise<{ rate: TransportRateView; reapply: ReapplyRatesResult }> {
    requireRateWriter(ctx);
    const rate = await financeRepository.updateTransportRate(id, input);
    if (!rate) throw Errors.notFound('Transport rate not found');
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'finance.transport_rate_updated', resourceType: 'TransportRate', resourceId: id });
    const reapply = await financeService.reapplyRatesToAllCostBreakdowns(ctx);
    return { rate, reapply };
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
  async updateFoodBeverageRate(ctx: AuthContext, id: string, input: CreateFoodBeverageRateInput): Promise<{ rate: FoodBeverageRateView; reapply: ReapplyRatesResult }> {
    requireRateWriter(ctx);
    const rate = await financeRepository.updateFoodBeverageRate(id, input);
    if (!rate) throw Errors.notFound('Food/beverage rate not found');
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'finance.food_beverage_rate_updated', resourceType: 'FoodBeverageRate', resourceId: id });
    const reapply = await financeService.reapplyRatesToAllCostBreakdowns(ctx);
    return { rate, reapply };
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
  async updateActivityFee(ctx: AuthContext, id: string, input: CreateActivityFeeInput): Promise<{ fee: ActivityFeeView; reapply: ReapplyRatesResult }> {
    requireRateWriter(ctx);
    const activity = await itineraryService.getActivity(ctx, input.activityId);
    const fee = await financeRepository.updateActivityFee(id, { ...input, name: activity.name });
    if (!fee) throw Errors.notFound('Activity fee not found');
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'finance.activity_fee_updated', resourceType: 'ActivityFee', resourceId: id });
    const reapply = await financeService.reapplyRatesToAllCostBreakdowns(ctx);
    return { fee, reapply };
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
  async updateImmigrationCostRate(ctx: AuthContext, id: string, input: CreateImmigrationCostRateInput): Promise<{ rate: ImmigrationCostRateView; reapply: ReapplyRatesResult }> {
    requireRateWriter(ctx);
    const rate = await financeRepository.updateImmigrationCostRate(id, input);
    if (!rate) throw Errors.notFound('Immigration cost rate not found');
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'finance.immigration_cost_rate_updated', resourceType: 'ImmigrationCostRate', resourceId: id });
    const reapply = await financeService.reapplyRatesToAllCostBreakdowns(ctx);
    return { rate, reapply };
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
  async updateAdminCostRate(ctx: AuthContext, id: string, input: CreateAdminCostRateInput): Promise<{ rate: AdminCostRateView; reapply: ReapplyRatesResult }> {
    requireRateWriter(ctx);
    const rate = await financeRepository.updateAdminCostRate(id, input);
    if (!rate) throw Errors.notFound('Admin cost rate not found');
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'finance.admin_cost_rate_updated', resourceType: 'AdminCostRate', resourceId: id });
    const reapply = await financeService.reapplyRatesToAllCostBreakdowns(ctx);
    return { rate, reapply };
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
  // No reapply sweep here, unlike every other rate type above -- an
  // AddonRate is resolved live at add-on selection time
  // (src/lib/addon-rates.ts), never snapshotted into a cost breakdown, so
  // there's nothing to recompute.
  async updateAddonRate(ctx: AuthContext, id: string, input: CreateAddonRateInput): Promise<AddonRateView> {
    requireRateWriter(ctx);
    const rate = await financeRepository.updateAddonRate(id, input);
    if (!rate) throw Errors.notFound('Addon rate not found');
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'finance.addon_rate_updated', resourceType: 'AddonRate', resourceId: id });
    return rate;
  },
  async deleteAddonRate(ctx: AuthContext, id: string): Promise<void> {
    requireRateWriter(ctx);
    const deleted = await financeRepository.deleteAddonRate(id);
    if (!deleted) throw Errors.notFound('Addon rate not found');
    await audit({ actorUserId: ctx.userId, actorRole: ctx.roles[0], action: 'finance.addon_rate_deleted', resourceType: 'AddonRate', resourceId: id });
  },

  /** Explicit user request: after any operational-rate price update, every
   * existing package/booking cost breakdown is recomputed against the new
   * rate and re-saved, so TourPackage.priceMinor (and the booking-side
   * suggested total) reflect the current price immediately rather than
   * staying pinned to whatever was effective when the breakdown was last
   * saved. Deliberately global rather than scoped to just the rate that
   * changed -- most rates resolve by (country, effective date), not a
   * stored FK on the breakdown, so there is no cheap way to know in advance
   * which breakdowns a given rate actually feeds; replaying every one is
   * the only reliable way to find out. Each breakdown is replayed through
   * its own already-persisted inputs via saveCostBreakdown/
   * saveBookingCostBreakdown -- the same path the staff form itself uses,
   * never a separate computation. A breakdown with a staff price override
   * keeps that override untouched (saveCostBreakdown/saveBookingCostBreakdown
   * both carry overridePriceMinor through unchanged; only the display-only
   * computed*Minor bucket snapshots refresh) since an override is a
   * deliberate final word, not something a rate change should silently
   * overwrite. One breakdown failing to recompute (an unresolved rate, a
   * booking that's since gone terminal, a package no longer visible) is
   * skipped rather than aborting the sweep (charter rule 8's graceful-
   * degradation posture, applied to a bulk operation) -- the caller sees
   * exactly which were skipped and why. */
  async reapplyRatesToAllCostBreakdowns(ctx: AuthContext): Promise<ReapplyRatesResult> {
    requireRateWriter(ctx);
    const organizationId = requireOrg(ctx);

    const packageIds = await financeRepository.listAllPackageBreakdownTourPackageIds(organizationId);
    const packagesSkipped: Array<{ tourPackageId: string; reason: string }> = [];
    let packagesUpdated = 0;
    for (const tourPackageId of packageIds) {
      const breakdown = await financeRepository.findBreakdownForPackage(organizationId, tourPackageId);
      if (!breakdown) continue;
      try {
        await financeService.saveCostBreakdown(ctx, tourPackageId, toSaveCostBreakdownInput(breakdown));
        packagesUpdated++;
      } catch (err) {
        packagesSkipped.push({ tourPackageId, reason: err instanceof Error ? err.message : 'Failed to recompute' });
      }
    }

    const bookingIds = await financeRepository.listAllBookingBreakdownBookingIds(organizationId);
    const bookingsSkipped: Array<{ bookingId: string; reason: string }> = [];
    let bookingsUpdated = 0;
    for (const bookingId of bookingIds) {
      const breakdown = await financeRepository.findBreakdownForBooking(organizationId, bookingId);
      if (!breakdown) continue;
      try {
        await financeService.saveBookingCostBreakdown(ctx, bookingId, toSaveBookingCostBreakdownInput(breakdown));
        bookingsUpdated++;
      } catch (err) {
        bookingsSkipped.push({ bookingId, reason: err instanceof Error ? err.message : 'Failed to recompute' });
      }
    }

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'finance.rates_reapplied',
      resourceType: 'PackageCostBreakdown',
      organizationId,
      metadata: { packagesUpdated, packagesSkipped, bookingsUpdated, bookingsSkipped },
    });

    return { packagesUpdated, packagesSkipped, bookingsUpdated, bookingsSkipped };
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
  async generatePackageSummaryPdf(
    ctx: AuthContext,
    tourPackageId: string,
    locale: PdfLocale,
  ): Promise<{ body: Buffer; contentType: string; filename: string }> {
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

    return {
      body,
      contentType: 'application/pdf',
      filename: buildPackageSummaryPdfFilename(pkg.title, pkg.packageReference, locale, 'staff'),
    };
  },

  /** DR-152 (explicit user request): the client-facing counterpart to
   * generatePackageSummaryPdf above -- same itinerary content, but no
   * internal cost breakdown at all, only the participant count and the one
   * total a guest is actually charged. Deliberately more permissive than
   * the staff version's precondition: it only needs pkg.priceMinor and the
   * breakdown's referenceGroupSize, not every computed*Minor bucket, so a
   * package whose breakdown predates the current pricing model (and would
   * 409 on the staff PDF) can still produce a client-facing document as
   * long as it has an actual price. Still staff-triggered (catalog.write,
   * not a new permission) -- there's no guest-facing download route; this
   * produces a document meant to be forwarded to a guest, not fetched by
   * one. The per-day hotel-rate resolution the staff PDF needs is skipped
   * entirely here, since the client document never shows a rate. */
  async generateClientPackageSummaryPdf(
    ctx: AuthContext,
    tourPackageId: string,
    locale: PdfLocale,
  ): Promise<{ body: Buffer; contentType: string; filename: string }> {
    assertCan(ctx, 'catalog.write');
    const organizationId = requireOrg(ctx);
    const pkg = await catalogService.getPackage(ctx, tourPackageId); // 404s if not found/visible
    if (pkg.priceMinor == null) throw Errors.conflict('This package has no price yet -- save a cost breakdown before downloading a summary');

    const breakdown = await financeRepository.findBreakdownForPackage(organizationId, tourPackageId);
    if (!breakdown) throw Errors.conflict('This package has no cost breakdown yet -- save one before downloading a summary');

    const templateDays = await catalogService.listTemplateDays(ctx, tourPackageId);
    const hotelIds = [...new Set(templateDays.map((d) => d.hotelId).filter((id): id is string => id != null))];
    const restaurantIds = [...new Set(templateDays.map((d) => d.restaurantId).filter((id): id is string => id != null))];
    const activityIds = [...new Set(templateDays.flatMap((d) => d.activityIds))];

    const [hotels, restaurants, activities] = await Promise.all([
      hotelIds.length > 0 ? itineraryService.listHotelsByIds(ctx, hotelIds) : Promise.resolve([]),
      restaurantIds.length > 0 ? itineraryService.listRestaurantsByIds(ctx, restaurantIds) : Promise.resolve([]),
      activityIds.length > 0 ? itineraryService.listActivitiesByIds(ctx, activityIds) : Promise.resolve([]),
    ]);
    const hotelNameById = new Map(hotels.map((h) => [h.id, h.name]));
    const restaurantNameById = new Map(restaurants.map((r) => [r.id, r.name]));
    const activityNameById = new Map(activities.map((a) => [a.id, a.name]));

    const days: PackageSummaryPdfDay[] = templateDays.map((d) => {
      const activityNames = d.activityIds.map((id) => activityNameById.get(id)).filter((n): n is string => n != null);
      return {
        dayNumber: d.dayNumber,
        hotelName: d.hotelId ? (hotelNameById.get(d.hotelId) ?? null) : null,
        restaurantName: d.restaurantId ? (restaurantNameById.get(d.restaurantId) ?? null) : null,
        activitiesLabel: activityNames.length > 0 ? activityNames.join(', ') : (d.activities ?? null),
      };
    });

    const body = await renderClientPackageSummaryPdf({
      locale,
      currency: pkg.currency,
      title: pkg.title,
      packageReference: pkg.packageReference,
      referenceGroupSize: breakdown.referenceGroupSize,
      priceMinor: pkg.priceMinor,
      days,
    });

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'finance.package_client_summary_pdf_downloaded',
      resourceType: 'TourPackage',
      resourceId: tourPackageId,
      organizationId,
    });

    return {
      body,
      contentType: 'application/pdf',
      filename: buildPackageSummaryPdfFilename(pkg.title, pkg.packageReference, locale, 'client'),
    };
  },

  /** Public (no ctx -- same "rate tables are platform-wide reference data,
   * no permission gate" convention as resolveRatesForCost/getEffectiveTaxRate
   * themselves) so invoicing can blend a TAILOR_MADE booking's tax rate the
   * same way saveCostBreakdown does for a standard package, without a
   * second finance -> booking-shaped dependency for just this one lookup. */
  async resolveEffectiveTaxRateBp(
    fallbackCountry: string,
    templateDays: Pick<PackageItineraryDayView, 'hotelId'>[],
    at: Date = new Date(),
  ): Promise<{ rateBp: number; countries: string[] }> {
    return computeBlendedTaxRate(fallbackCountry, templateDays, at);
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
      driverDailyRateMinor: driverRate?.dailyRateMinor ?? null,
      guideDailyRateMinor: guideRate?.dailyRateMinor ?? null,
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
    // DR-145: a combo package (this Day Template's hotels spanning 2+
    // countries) blends each country's own rate by night count instead of
    // taxing the whole trip at just pkg.country -- see computeBlendedTaxRate.
    let taxRateBp: number;
    try {
      ({ rateBp: taxRateBp } = await computeBlendedTaxRate(pkg.country, templateDays, now));
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
      driverDailyRateMinor: driverRate?.dailyRateMinor ?? null,
      guideDailyRateMinor: guideRate?.dailyRateMinor ?? null,
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

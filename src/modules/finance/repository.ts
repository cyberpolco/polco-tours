// finance module — repository. The only place that touches
// prisma.staffRate/hotelRate/transportRate/foodBeverageRate/activityFee/
// immigrationCostRate/adminCostRate/addonRate/packageCostBreakdown/
// packageCostLineItem for this module. The eight rate tables are
// platform-wide (no organizationId, no RLS -- same precedent as TaxRate,
// uses the plain global `prisma` client, no withOrg); the cost-breakdown
// tables ARE org-scoped and go through withOrg like every other tenant
// table.
import type {
  ActivityFee,
  AddonRate,
  AdminCostRate,
  BookingCostBreakdown,
  BookingCostLineItem,
  FoodBeverageCategory,
  FoodBeverageRate,
  HotelRate,
  ImmigrationCostRate,
  PackageCostBreakdown,
  PackageCostLineItem,
  RestaurantRate,
  StaffRate,
  StaffRateRole,
  TransportRate,
} from '@prisma/client';
import { prisma, withOrg } from '@lib/db';
import type {
  ActivityFeeView,
  AddonRateView,
  AdminCostRateView,
  BookingCostBreakdownView,
  BookingDrinkLineItemView,
  CreateActivityFeeInput,
  CreateAddonRateInput,
  CreateAdminCostRateInput,
  CreateFoodBeverageRateInput,
  CreateHotelRateInput,
  CreateImmigrationCostRateInput,
  CreateRestaurantRateInput,
  CreateStaffRateInput,
  CreateTransportRateInput,
  FoodBeverageRateView,
  HotelRateView,
  ImmigrationCostRateView,
  PackageCostBreakdownView,
  PackageDrinkLineItemView,
  RestaurantRateView,
  StaffRateView,
  TransportRateView,
} from './domain';

function toStaffRateView(r: StaffRate): StaffRateView {
  return { id: r.id, country: r.country, role: r.role, dailyRateMinor: r.dailyRateMinor, currency: r.currency, validFrom: r.validFrom, validTo: r.validTo };
}
function toHotelRateView(r: HotelRate): HotelRateView {
  return { id: r.id, country: r.country, hotelId: r.hotelId, roomCategory: r.roomCategory, nightlyRateMinor: r.nightlyRateMinor, currency: r.currency, validFrom: r.validFrom, validTo: r.validTo };
}
function toRestaurantRateView(r: RestaurantRate): RestaurantRateView {
  return { id: r.id, country: r.country, restaurantId: r.restaurantId, dailyRateMinor: r.dailyRateMinor, currency: r.currency, validFrom: r.validFrom, validTo: r.validTo };
}
function toTransportRateView(r: TransportRate): TransportRateView {
  return {
    id: r.id,
    country: r.country,
    fuelEstimateMinor: r.fuelEstimateMinor,
    tollFeesMinor: r.tollFeesMinor,
    parkingFeesMinor: r.parkingFeesMinor,
    vehicleOperatingCostMinor: r.vehicleOperatingCostMinor,
    currency: r.currency,
    validFrom: r.validFrom,
    validTo: r.validTo,
  };
}
function toFoodBeverageRateView(r: FoodBeverageRate): FoodBeverageRateView {
  return { id: r.id, country: r.country, category: r.category, perUnitMinor: r.perUnitMinor, currency: r.currency, validFrom: r.validFrom, validTo: r.validTo };
}
function toActivityFeeView(r: ActivityFee): ActivityFeeView {
  return { id: r.id, country: r.country, activityId: r.activityId, name: r.name, feeMinor: r.feeMinor, currency: r.currency, validFrom: r.validFrom, validTo: r.validTo };
}
function toImmigrationCostRateView(r: ImmigrationCostRate): ImmigrationCostRateView {
  return {
    id: r.id,
    country: r.country,
    visaFeeMinor: r.visaFeeMinor,
    processingFeeMinor: r.processingFeeMinor,
    invitationLetterFeeMinor: r.invitationLetterFeeMinor,
    borderPermitFeeMinor: r.borderPermitFeeMinor,
    currency: r.currency,
    validFrom: r.validFrom,
    validTo: r.validTo,
  };
}
function toAdminCostRateView(r: AdminCostRate): AdminCostRateView {
  return { id: r.id, country: r.country, dailyRateMinor: r.dailyRateMinor, currency: r.currency, validFrom: r.validFrom, validTo: r.validTo };
}
function toAddonRateView(r: AddonRate): AddonRateView {
  return { id: r.id, country: r.country, code: r.code, priceMinor: r.priceMinor, currency: r.currency, validFrom: r.validFrom, validTo: r.validTo };
}
function toLineItemView(li: PackageCostLineItem): PackageDrinkLineItemView {
  return { id: li.id, foodBeverageRateId: li.foodBeverageRateId, quantityPerPerson: li.quantityPerPerson };
}
function toBreakdownView(b: PackageCostBreakdown & { lineItems: PackageCostLineItem[] }): PackageCostBreakdownView {
  return {
    id: b.id,
    organizationId: b.organizationId,
    tourPackageId: b.tourPackageId,
    currency: b.currency,
    referenceGroupSize: b.referenceGroupSize,
    nights: b.nights,
    driverDays: b.driverDays,
    guideDays: b.guideDays,
    photographerDays: b.photographerDays,
    videographerDays: b.videographerDays,
    transportRateId: b.transportRateId,
    transportDays: b.transportDays,
    requiresVisa: b.requiresVisa,
    immigrationCostRateId: b.immigrationCostRateId,
    adminDays: b.adminDays,
    adminCostBasis: b.adminCostBasis,
    agencyMarginBp: b.agencyMarginBp,
    computedAccommodationMinor: b.computedAccommodationMinor,
    computedRestaurantMinor: b.computedRestaurantMinor,
    computedActivitiesMinor: b.computedActivitiesMinor,
    computedBaseCostMinor: b.computedBaseCostMinor,
    computedSellingPriceMinor: b.computedSellingPriceMinor,
    computedTaxMinor: b.computedTaxMinor,
    computedPlatformFeeMinor: b.computedPlatformFeeMinor,
    computedTotalMinor: b.computedTotalMinor,
    taxRateBpSnapshot: b.taxRateBpSnapshot,
    platformFeeRateBpSnapshot: b.platformFeeRateBpSnapshot,
    overridePriceMinor: b.overridePriceMinor,
    overrideReason: b.overrideReason,
    overriddenByUserId: b.overriddenByUserId,
    overriddenAt: b.overriddenAt,
    drinkLineItems: b.lineItems.map(toLineItemView),
  };
}
function toBookingLineItemView(li: BookingCostLineItem): BookingDrinkLineItemView {
  return { id: li.id, foodBeverageRateId: li.foodBeverageRateId, quantityPerPerson: li.quantityPerPerson };
}
function toBookingBreakdownView(b: BookingCostBreakdown & { lineItems: BookingCostLineItem[] }): BookingCostBreakdownView {
  return {
    id: b.id,
    organizationId: b.organizationId,
    bookingId: b.bookingId,
    currency: b.currency,
    nights: b.nights,
    driverDays: b.driverDays,
    guideDays: b.guideDays,
    photographerDays: b.photographerDays,
    videographerDays: b.videographerDays,
    transportRateId: b.transportRateId,
    transportDays: b.transportDays,
    requiresVisa: b.requiresVisa,
    immigrationCostRateId: b.immigrationCostRateId,
    adminDays: b.adminDays,
    adminCostBasis: b.adminCostBasis,
    agencyMarginBp: b.agencyMarginBp,
    computedAccommodationMinor: b.computedAccommodationMinor,
    computedRestaurantMinor: b.computedRestaurantMinor,
    computedActivitiesMinor: b.computedActivitiesMinor,
    computedBaseCostMinor: b.computedBaseCostMinor,
    computedSellingPriceMinor: b.computedSellingPriceMinor,
    addonsTotalMinor: b.addonsTotalMinor,
    overridePriceMinor: b.overridePriceMinor,
    overrideReason: b.overrideReason,
    overriddenByUserId: b.overriddenByUserId,
    overriddenAt: b.overriddenAt,
    drinkLineItems: b.lineItems.map(toBookingLineItemView),
    suggestedTotalMinor:
      b.overridePriceMinor ?? (b.computedSellingPriceMinor != null ? b.computedSellingPriceMinor + b.addonsTotalMinor : null),
  };
}

export const financeRepository = {
  // ------------------------------------------------------------ StaffRate
  async listStaffRates(): Promise<StaffRateView[]> {
    const rows = await prisma.staffRate.findMany({ orderBy: [{ country: 'asc' }, { role: 'asc' }, { validFrom: 'desc' }] });
    return rows.map(toStaffRateView);
  },
  async createStaffRate(input: CreateStaffRateInput): Promise<StaffRateView> {
    const r = await prisma.staffRate.create({ data: input });
    return toStaffRateView(r);
  },
  async deleteStaffRate(id: string): Promise<StaffRateView | null> {
    const existing = await prisma.staffRate.findUnique({ where: { id } });
    if (!existing) return null;
    await prisma.staffRate.delete({ where: { id } });
    return toStaffRateView(existing);
  },
  // Same effective-dating query shape as src/lib/tax.ts's getEffectiveTaxRate.
  async findEffectiveStaffRate(country: string, role: StaffRateRole, at: Date): Promise<StaffRateView | null> {
    const r = await prisma.staffRate.findFirst({
      where: { country, role, validFrom: { lte: at }, OR: [{ validTo: null }, { validTo: { gte: at } }] },
      orderBy: { validFrom: 'desc' },
    });
    return r ? toStaffRateView(r) : null;
  },

  // ------------------------------------------------------------ HotelRate
  async listHotelRates(): Promise<HotelRateView[]> {
    const rows = await prisma.hotelRate.findMany({ orderBy: [{ country: 'asc' }, { validFrom: 'desc' }] });
    return rows.map(toHotelRateView);
  },
  async createHotelRate(input: CreateHotelRateInput): Promise<HotelRateView> {
    const r = await prisma.hotelRate.create({ data: input });
    return toHotelRateView(r);
  },
  async deleteHotelRate(id: string): Promise<HotelRateView | null> {
    const existing = await prisma.hotelRate.findUnique({ where: { id } });
    if (!existing) return null;
    await prisma.hotelRate.delete({ where: { id } });
    return toHotelRateView(existing);
  },
  async findHotelRateById(id: string): Promise<HotelRateView | null> {
    const r = await prisma.hotelRate.findUnique({ where: { id } });
    return r ? toHotelRateView(r) : null;
  },
  /** DR-131: resolves the currently-effective rate for a specific hotel --
   * replaces the old "staff picks a hotelRateId directly, no date check"
   * flow now that accommodation is derived automatically from the Day
   * Template rather than staff-picked. Same effective-dating shape as
   * findEffectiveStaffRate, keyed by hotelId instead of country+role. */
  async findEffectiveHotelRateForHotel(hotelId: string, at: Date): Promise<HotelRateView | null> {
    const r = await prisma.hotelRate.findFirst({
      where: { hotelId, validFrom: { lte: at }, OR: [{ validTo: null }, { validTo: { gte: at } }] },
      orderBy: { validFrom: 'desc' },
    });
    return r ? toHotelRateView(r) : null;
  },

  // -------------------------------------------------------- RestaurantRate
  async listRestaurantRates(): Promise<RestaurantRateView[]> {
    const rows = await prisma.restaurantRate.findMany({ orderBy: [{ country: 'asc' }, { validFrom: 'desc' }] });
    return rows.map(toRestaurantRateView);
  },
  async createRestaurantRate(input: CreateRestaurantRateInput): Promise<RestaurantRateView> {
    const r = await prisma.restaurantRate.create({ data: input });
    return toRestaurantRateView(r);
  },
  async deleteRestaurantRate(id: string): Promise<RestaurantRateView | null> {
    const existing = await prisma.restaurantRate.findUnique({ where: { id } });
    if (!existing) return null;
    await prisma.restaurantRate.delete({ where: { id } });
    return toRestaurantRateView(existing);
  },
  /** Restaurant counterpart to findEffectiveHotelRateForHotel -- identical shape. */
  async findEffectiveRestaurantRateForRestaurant(restaurantId: string, at: Date): Promise<RestaurantRateView | null> {
    const r = await prisma.restaurantRate.findFirst({
      where: { restaurantId, validFrom: { lte: at }, OR: [{ validTo: null }, { validTo: { gte: at } }] },
      orderBy: { validFrom: 'desc' },
    });
    return r ? toRestaurantRateView(r) : null;
  },

  // -------------------------------------------------------- TransportRate
  async listTransportRates(): Promise<TransportRateView[]> {
    const rows = await prisma.transportRate.findMany({ orderBy: [{ country: 'asc' }, { validFrom: 'desc' }] });
    return rows.map(toTransportRateView);
  },
  async createTransportRate(input: CreateTransportRateInput): Promise<TransportRateView> {
    const r = await prisma.transportRate.create({ data: input });
    return toTransportRateView(r);
  },
  async deleteTransportRate(id: string): Promise<TransportRateView | null> {
    const existing = await prisma.transportRate.findUnique({ where: { id } });
    if (!existing) return null;
    await prisma.transportRate.delete({ where: { id } });
    return toTransportRateView(existing);
  },
  async findTransportRateById(id: string): Promise<TransportRateView | null> {
    const r = await prisma.transportRate.findUnique({ where: { id } });
    return r ? toTransportRateView(r) : null;
  },

  // ---------------------------------------------------- FoodBeverageRate
  async listFoodBeverageRates(): Promise<FoodBeverageRateView[]> {
    const rows = await prisma.foodBeverageRate.findMany({ orderBy: [{ country: 'asc' }, { category: 'asc' }, { validFrom: 'desc' }] });
    return rows.map(toFoodBeverageRateView);
  },
  async createFoodBeverageRate(input: CreateFoodBeverageRateInput): Promise<FoodBeverageRateView> {
    const r = await prisma.foodBeverageRate.create({ data: input });
    return toFoodBeverageRateView(r);
  },
  async deleteFoodBeverageRate(id: string): Promise<FoodBeverageRateView | null> {
    const existing = await prisma.foodBeverageRate.findUnique({ where: { id } });
    if (!existing) return null;
    await prisma.foodBeverageRate.delete({ where: { id } });
    return toFoodBeverageRateView(existing);
  },
  async findFoodBeverageRateById(id: string): Promise<FoodBeverageRateView | null> {
    const r = await prisma.foodBeverageRate.findUnique({ where: { id } });
    return r ? toFoodBeverageRateView(r) : null;
  },
  async findFoodBeverageRatesByIds(ids: string[]): Promise<FoodBeverageRateView[]> {
    if (ids.length === 0) return [];
    const rows = await prisma.foodBeverageRate.findMany({ where: { id: { in: ids } } });
    return rows.map(toFoodBeverageRateView);
  },
  async findEffectiveFoodBeverageRate(country: string, category: FoodBeverageCategory, at: Date): Promise<FoodBeverageRateView | null> {
    const r = await prisma.foodBeverageRate.findFirst({
      where: { country, category, validFrom: { lte: at }, OR: [{ validTo: null }, { validTo: { gte: at } }] },
      orderBy: { validFrom: 'desc' },
    });
    return r ? toFoodBeverageRateView(r) : null;
  },

  // -------------------------------------------------------------- ActivityFee
  async listActivityFees(): Promise<ActivityFeeView[]> {
    const rows = await prisma.activityFee.findMany({ orderBy: [{ country: 'asc' }, { validFrom: 'desc' }] });
    return rows.map(toActivityFeeView);
  },
  // DR-116: `name` is derived server-side (financeService.createActivityFee)
  // from the linked Activity rather than part of CreateActivityFeeInput --
  // the caller composes the full row here.
  async createActivityFee(input: CreateActivityFeeInput & { name: string }): Promise<ActivityFeeView> {
    const r = await prisma.activityFee.create({ data: input });
    return toActivityFeeView(r);
  },
  async deleteActivityFee(id: string): Promise<ActivityFeeView | null> {
    const existing = await prisma.activityFee.findUnique({ where: { id } });
    if (!existing) return null;
    await prisma.activityFee.delete({ where: { id } });
    return toActivityFeeView(existing);
  },
  async findActivityFeesByIds(ids: string[]): Promise<ActivityFeeView[]> {
    if (ids.length === 0) return [];
    const rows = await prisma.activityFee.findMany({ where: { id: { in: ids } } });
    return rows.map(toActivityFeeView);
  },
  /** DR-131: resolves the currently-effective fee for a specific Activity --
   * same "effective by entity id + date" shape as findEffectiveHotelRateForHotel,
   * now that activities are derived automatically from the Day Template's
   * activityIds rather than staff-picked as a line item. */
  async findEffectiveActivityFeeForActivity(activityId: string, at: Date): Promise<ActivityFeeView | null> {
    const r = await prisma.activityFee.findFirst({
      where: { activityId, validFrom: { lte: at }, OR: [{ validTo: null }, { validTo: { gte: at } }] },
      orderBy: { validFrom: 'desc' },
    });
    return r ? toActivityFeeView(r) : null;
  },

  // -------------------------------------------------------- ImmigrationCostRate
  async listImmigrationCostRates(): Promise<ImmigrationCostRateView[]> {
    const rows = await prisma.immigrationCostRate.findMany({ orderBy: [{ country: 'asc' }, { validFrom: 'desc' }] });
    return rows.map(toImmigrationCostRateView);
  },
  async createImmigrationCostRate(input: CreateImmigrationCostRateInput): Promise<ImmigrationCostRateView> {
    const r = await prisma.immigrationCostRate.create({ data: input });
    return toImmigrationCostRateView(r);
  },
  async deleteImmigrationCostRate(id: string): Promise<ImmigrationCostRateView | null> {
    const existing = await prisma.immigrationCostRate.findUnique({ where: { id } });
    if (!existing) return null;
    await prisma.immigrationCostRate.delete({ where: { id } });
    return toImmigrationCostRateView(existing);
  },
  async findImmigrationCostRateById(id: string): Promise<ImmigrationCostRateView | null> {
    const r = await prisma.immigrationCostRate.findUnique({ where: { id } });
    return r ? toImmigrationCostRateView(r) : null;
  },

  // -------------------------------------------------------------- AdminCostRate
  async listAdminCostRates(): Promise<AdminCostRateView[]> {
    const rows = await prisma.adminCostRate.findMany({ orderBy: [{ country: 'asc' }, { validFrom: 'desc' }] });
    return rows.map(toAdminCostRateView);
  },
  async createAdminCostRate(input: CreateAdminCostRateInput): Promise<AdminCostRateView> {
    const r = await prisma.adminCostRate.create({ data: input });
    return toAdminCostRateView(r);
  },
  async deleteAdminCostRate(id: string): Promise<AdminCostRateView | null> {
    const existing = await prisma.adminCostRate.findUnique({ where: { id } });
    if (!existing) return null;
    await prisma.adminCostRate.delete({ where: { id } });
    return toAdminCostRateView(existing);
  },
  async findEffectiveAdminCostRate(country: string, at: Date): Promise<AdminCostRateView | null> {
    const r = await prisma.adminCostRate.findFirst({
      where: { country, validFrom: { lte: at }, OR: [{ validTo: null }, { validTo: { gte: at } }] },
      orderBy: { validFrom: 'desc' },
    });
    return r ? toAdminCostRateView(r) : null;
  },

  // -------------------------------------------------------------- AddonRate
  // Staff CRUD only (Operational Rates page) -- the actual resolve-for-
  // pricing read lives in src/lib/addon-rates.ts, queried directly against
  // Prisma with no AuthContext/permission gate, same "guest checkout must
  // read this too" precedent as src/lib/tax.ts. Kept separate rather than
  // wrapped here so that plain-lib helper has no dependency on this module.
  async listAddonRates(): Promise<AddonRateView[]> {
    const rows = await prisma.addonRate.findMany({ orderBy: [{ country: 'asc' }, { code: 'asc' }, { validFrom: 'desc' }] });
    return rows.map(toAddonRateView);
  },
  async createAddonRate(input: CreateAddonRateInput): Promise<AddonRateView> {
    const r = await prisma.addonRate.create({ data: input });
    return toAddonRateView(r);
  },
  async deleteAddonRate(id: string): Promise<AddonRateView | null> {
    const existing = await prisma.addonRate.findUnique({ where: { id } });
    if (!existing) return null;
    await prisma.addonRate.delete({ where: { id } });
    return toAddonRateView(existing);
  },

  // ---------------------------------------------------- PackageCostBreakdown
  async findBreakdownForPackage(organizationId: string, tourPackageId: string): Promise<PackageCostBreakdownView | null> {
    return withOrg(organizationId, async (tx) => {
      const b = await tx.packageCostBreakdown.findUnique({ where: { tourPackageId }, include: { lineItems: true } });
      return b ? toBreakdownView(b) : null;
    });
  },

  /** Upsert-by-tourPackageId (one breakdown per package) + replace-all its
   * line items -- mirrors bookingRepository.replaceAddons's
   * delete-then-recreate pattern for a "this wizard step is meant to be
   * finalized as a whole" write. */
  async upsertBreakdown(
    organizationId: string,
    tourPackageId: string,
    data: Omit<
      PackageCostBreakdown,
      'id' | 'organizationId' | 'tourPackageId' | 'createdAt' | 'updatedAt'
    >,
    lineItems: Array<{ foodBeverageRateId: string; quantityPerPerson: number }>,
  ): Promise<PackageCostBreakdownView> {
    return withOrg(organizationId, async (tx) => {
      const breakdown = await tx.packageCostBreakdown.upsert({
        where: { tourPackageId },
        create: { organizationId, tourPackageId, ...data },
        update: data,
      });
      await tx.packageCostLineItem.deleteMany({ where: { packageCostBreakdownId: breakdown.id } });
      if (lineItems.length > 0) {
        await tx.packageCostLineItem.createMany({
          data: lineItems.map((li) => ({ organizationId, packageCostBreakdownId: breakdown.id, ...li })),
        });
      }
      const withLineItems = await tx.packageCostBreakdown.findUniqueOrThrow({
        where: { id: breakdown.id },
        include: { lineItems: true },
      });
      return toBreakdownView(withLineItems);
    });
  },

  // ---------------------------------------------------- BookingCostBreakdown
  async findBreakdownForBooking(organizationId: string, bookingId: string): Promise<BookingCostBreakdownView | null> {
    return withOrg(organizationId, async (tx) => {
      const b = await tx.bookingCostBreakdown.findUnique({ where: { bookingId }, include: { lineItems: true } });
      return b ? toBookingBreakdownView(b) : null;
    });
  },

  /** Upsert-by-bookingId (one breakdown per booking) + replace-all its line
   * items -- same delete-then-recreate shape as upsertBreakdown above. */
  async upsertBookingBreakdown(
    organizationId: string,
    bookingId: string,
    data: Omit<BookingCostBreakdown, 'id' | 'organizationId' | 'bookingId' | 'createdAt' | 'updatedAt'>,
    lineItems: Array<{ foodBeverageRateId: string; quantityPerPerson: number }>,
  ): Promise<BookingCostBreakdownView> {
    return withOrg(organizationId, async (tx) => {
      const breakdown = await tx.bookingCostBreakdown.upsert({
        where: { bookingId },
        create: { organizationId, bookingId, ...data },
        update: data,
      });
      await tx.bookingCostLineItem.deleteMany({ where: { bookingCostBreakdownId: breakdown.id } });
      if (lineItems.length > 0) {
        await tx.bookingCostLineItem.createMany({
          data: lineItems.map((li) => ({ organizationId, bookingCostBreakdownId: breakdown.id, ...li })),
        });
      }
      const withLineItems = await tx.bookingCostBreakdown.findUniqueOrThrow({
        where: { id: breakdown.id },
        include: { lineItems: true },
      });
      return toBookingBreakdownView(withLineItems);
    });
  },
};

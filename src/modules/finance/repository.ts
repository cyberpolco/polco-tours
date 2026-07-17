// finance module — repository. The only place that touches
// prisma.staffRate/hotelRate/transportRate/foodBeverageRate/activityFee/
// immigrationCostRate/packageCostBreakdown/packageCostLineItem for this
// module. The six rate tables are platform-wide (no organizationId, no RLS
// -- same precedent as TaxRate, uses the plain global `prisma` client, no
// withOrg); the cost-breakdown tables ARE org-scoped and go through
// withOrg like every other tenant table.
import type {
  ActivityFee,
  FoodBeverageCategory,
  FoodBeverageRate,
  HotelRate,
  ImmigrationCostRate,
  PackageCostBreakdown,
  PackageCostLineItem,
  StaffRate,
  StaffRateRole,
  TransportRate,
} from '@prisma/client';
import { prisma, withOrg } from '@lib/db';
import type {
  ActivityFeeView,
  CreateActivityFeeInput,
  CreateFoodBeverageRateInput,
  CreateHotelRateInput,
  CreateImmigrationCostRateInput,
  CreateStaffRateInput,
  CreateTransportRateInput,
  FoodBeverageRateView,
  HotelRateView,
  ImmigrationCostRateView,
  PackageCostBreakdownView,
  PackageCostLineItemView,
  StaffRateView,
  TransportRateView,
} from './domain';

function toStaffRateView(r: StaffRate): StaffRateView {
  return { id: r.id, country: r.country, role: r.role, dailyRateMinor: r.dailyRateMinor, currency: r.currency, validFrom: r.validFrom, validTo: r.validTo };
}
function toHotelRateView(r: HotelRate): HotelRateView {
  return { id: r.id, country: r.country, roomCategory: r.roomCategory, nightlyRateMinor: r.nightlyRateMinor, currency: r.currency, validFrom: r.validFrom, validTo: r.validTo };
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
  return { id: r.id, country: r.country, name: r.name, feeMinor: r.feeMinor, currency: r.currency, validFrom: r.validFrom, validTo: r.validTo };
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
function toLineItemView(li: PackageCostLineItem): PackageCostLineItemView {
  return { id: li.id, foodBeverageRateId: li.foodBeverageRateId, activityFeeId: li.activityFeeId, quantityPerPerson: li.quantityPerPerson };
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
    hotelRateId: b.hotelRateId,
    roomsNeeded: b.roomsNeeded,
    breakfastCount: b.breakfastCount,
    lunchCount: b.lunchCount,
    dinnerCount: b.dinnerCount,
    transportRateId: b.transportRateId,
    transportDays: b.transportDays,
    requiresVisa: b.requiresVisa,
    immigrationCostRateId: b.immigrationCostRateId,
    agencyMarginBp: b.agencyMarginBp,
    computedBaseCostMinor: b.computedBaseCostMinor,
    computedSellingPriceMinor: b.computedSellingPriceMinor,
    overridePriceMinor: b.overridePriceMinor,
    overrideReason: b.overrideReason,
    overriddenByUserId: b.overriddenByUserId,
    overriddenAt: b.overriddenAt,
    lineItems: b.lineItems.map(toLineItemView),
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
  async createActivityFee(input: CreateActivityFeeInput): Promise<ActivityFeeView> {
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
    lineItems: Array<{ foodBeverageRateId?: string; activityFeeId?: string; quantityPerPerson: number }>,
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
};

// finance module — domain types & rules. Pure; no framework or DB imports.
// Finance Module (DR-039) -- a cost-plus pricing engine replacing
// TourPackage.priceMinor as a plain staff-typed number. Six platform-wide,
// effective-dated rate tables (mirrors TaxRate's precedent exactly) feed a
// per-package cost breakdown; "seasonal pricing" is expressed as
// overlapping date-ranged rows, no separate season concept.
import type { Currency, FoodBeverageCategory, StaffRateRole } from '@prisma/client';
import { z } from 'zod';

const CURRENCY_ENUM = z.enum(['USD', 'EUR', 'NAD', 'CDF']);
const EFFECTIVE_DATING = {
  validFrom: z.coerce.date().optional(),
  validTo: z.coerce.date().optional(),
};

// -------------------------------------------------------------- rate views

export interface StaffRateView {
  id: string;
  country: string;
  role: StaffRateRole;
  dailyRateMinor: number;
  currency: Currency;
  validFrom: Date;
  validTo: Date | null;
}

export interface HotelRateView {
  id: string;
  country: string;
  roomCategory: string;
  nightlyRateMinor: number;
  currency: Currency;
  validFrom: Date;
  validTo: Date | null;
}

export interface TransportRateView {
  id: string;
  country: string;
  fuelEstimateMinor: number;
  tollFeesMinor: number;
  parkingFeesMinor: number;
  vehicleOperatingCostMinor: number;
  currency: Currency;
  validFrom: Date;
  validTo: Date | null;
}

export interface FoodBeverageRateView {
  id: string;
  country: string;
  category: FoodBeverageCategory;
  perUnitMinor: number;
  currency: Currency;
  validFrom: Date;
  validTo: Date | null;
}

export interface ActivityFeeView {
  id: string;
  country: string;
  name: string;
  feeMinor: number;
  currency: Currency;
  validFrom: Date;
  validTo: Date | null;
}

export interface ImmigrationCostRateView {
  id: string;
  country: string;
  visaFeeMinor: number;
  processingFeeMinor: number;
  invitationLetterFeeMinor: number;
  borderPermitFeeMinor: number;
  currency: Currency;
  validFrom: Date;
  validTo: Date | null;
}

// ---------------------------------------------------------- rate input schemas

export const CreateStaffRateInput = z.object({
  country: z.string().length(2),
  role: z.enum(['DRIVER', 'GUIDE', 'PHOTOGRAPHER', 'VIDEOGRAPHER']),
  dailyRateMinor: z.number().int().nonnegative(),
  currency: CURRENCY_ENUM,
  ...EFFECTIVE_DATING,
});
export type CreateStaffRateInput = z.infer<typeof CreateStaffRateInput>;

export const CreateHotelRateInput = z.object({
  country: z.string().length(2),
  roomCategory: z.string().min(1).max(100),
  nightlyRateMinor: z.number().int().nonnegative(),
  currency: CURRENCY_ENUM,
  ...EFFECTIVE_DATING,
});
export type CreateHotelRateInput = z.infer<typeof CreateHotelRateInput>;

export const CreateTransportRateInput = z.object({
  country: z.string().length(2),
  fuelEstimateMinor: z.number().int().nonnegative(),
  tollFeesMinor: z.number().int().nonnegative(),
  parkingFeesMinor: z.number().int().nonnegative(),
  vehicleOperatingCostMinor: z.number().int().nonnegative(),
  currency: CURRENCY_ENUM,
  ...EFFECTIVE_DATING,
});
export type CreateTransportRateInput = z.infer<typeof CreateTransportRateInput>;

export const CreateFoodBeverageRateInput = z.object({
  country: z.string().length(2),
  category: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'WATER', 'SOFT_DRINK', 'JUICE', 'LOCAL_BEVERAGE', 'ALCOHOLIC']),
  perUnitMinor: z.number().int().nonnegative(),
  currency: CURRENCY_ENUM,
  ...EFFECTIVE_DATING,
});
export type CreateFoodBeverageRateInput = z.infer<typeof CreateFoodBeverageRateInput>;

export const CreateActivityFeeInput = z.object({
  country: z.string().length(2),
  name: z.string().min(1).max(200),
  feeMinor: z.number().int().nonnegative(),
  currency: CURRENCY_ENUM,
  ...EFFECTIVE_DATING,
});
export type CreateActivityFeeInput = z.infer<typeof CreateActivityFeeInput>;

export const CreateImmigrationCostRateInput = z.object({
  country: z.string().length(2),
  visaFeeMinor: z.number().int().nonnegative(),
  processingFeeMinor: z.number().int().nonnegative(),
  invitationLetterFeeMinor: z.number().int().nonnegative(),
  borderPermitFeeMinor: z.number().int().nonnegative(),
  currency: CURRENCY_ENUM,
  ...EFFECTIVE_DATING,
});
export type CreateImmigrationCostRateInput = z.infer<typeof CreateImmigrationCostRateInput>;

// ---------------------------------------------------- package cost breakdown

export interface PackageCostLineItemView {
  id: string;
  foodBeverageRateId: string | null;
  activityFeeId: string | null;
  quantityPerPerson: number;
}

export interface PackageCostBreakdownView {
  id: string;
  organizationId: string;
  tourPackageId: string;
  currency: Currency;
  referenceGroupSize: number;
  nights: number;
  driverDays: number;
  guideDays: number;
  photographerDays: number;
  videographerDays: number;
  hotelRateId: string | null;
  roomsNeeded: number;
  breakfastCount: number;
  lunchCount: number;
  dinnerCount: number;
  transportRateId: string | null;
  transportDays: number;
  requiresVisa: boolean;
  immigrationCostRateId: string | null;
  agencyMarginBp: number;
  computedBaseCostMinor: number | null;
  computedSellingPriceMinor: number | null;
  overridePriceMinor: number | null;
  overrideReason: string | null;
  overriddenByUserId: string | null;
  overriddenAt: Date | null;
  lineItems: PackageCostLineItemView[];
}

const LineItemInput = z
  .object({
    foodBeverageRateId: z.string().uuid().optional(),
    activityFeeId: z.string().uuid().optional(),
    quantityPerPerson: z.number().int().positive(),
  })
  .refine((v) => (v.foodBeverageRateId != null) !== (v.activityFeeId != null), {
    message: 'Exactly one of foodBeverageRateId/activityFeeId must be set',
  });

// overrideReason is required together with overridePriceMinor (spec:
// "Administrators may override calculated prices when necessary while
// maintaining an audit trail") -- validated by the refine below, not just
// convention.
export const SaveCostBreakdownInput = z
  .object({
    currency: CURRENCY_ENUM,
    referenceGroupSize: z.number().int().positive(),
    nights: z.number().int().nonnegative(),
    driverDays: z.number().int().nonnegative(),
    guideDays: z.number().int().nonnegative(),
    photographerDays: z.number().int().nonnegative().default(0),
    videographerDays: z.number().int().nonnegative().default(0),
    hotelRateId: z.string().uuid().optional(),
    roomsNeeded: z.number().int().positive().default(1),
    breakfastCount: z.number().int().nonnegative().default(0),
    lunchCount: z.number().int().nonnegative().default(0),
    dinnerCount: z.number().int().nonnegative().default(0),
    transportRateId: z.string().uuid().optional(),
    transportDays: z.number().int().nonnegative().default(0),
    requiresVisa: z.boolean().default(false),
    immigrationCostRateId: z.string().uuid().optional(),
    agencyMarginBp: z.number().int().min(0),
    lineItems: z.array(LineItemInput).optional().default([]),
    overridePriceMinor: z.number().int().nonnegative().optional(),
    overrideReason: z.string().min(1).max(500).optional(),
  })
  .refine((v) => (v.overridePriceMinor == null) === (v.overrideReason == null), {
    message: 'overrideReason is required when overridePriceMinor is set (and only then)',
  });
export type SaveCostBreakdownInput = z.infer<typeof SaveCostBreakdownInput>;

// ----------------------------------------------------------- pure computation

export interface CostInputs {
  referenceGroupSize: number;
  nights: number;
  driverDays: number;
  guideDays: number;
  photographerDays: number;
  videographerDays: number;
  driverDailyRateMinor: number | null;
  guideDailyRateMinor: number | null;
  photographerDailyRateMinor: number | null;
  videographerDailyRateMinor: number | null;
  hotelNightlyRateMinor: number | null;
  roomsNeeded: number;
  breakfastCount: number;
  lunchCount: number;
  dinnerCount: number;
  breakfastRateMinor: number | null;
  lunchRateMinor: number | null;
  dinnerRateMinor: number | null;
  transportDays: number;
  transportRate: {
    fuelEstimateMinor: number;
    tollFeesMinor: number;
    parkingFeesMinor: number;
    vehicleOperatingCostMinor: number;
  } | null;
  requiresVisa: boolean;
  immigrationCostRate: {
    visaFeeMinor: number;
    processingFeeMinor: number;
    invitationLetterFeeMinor: number;
    borderPermitFeeMinor: number;
  } | null;
  // Drinks (beyond the base meal counts) + activities, per-person quantities
  // -- already resolved to a flat perUnitMinor by the caller (service.ts),
  // since domain.ts touches no DB.
  lineItems: Array<{ perUnitMinor: number; quantityPerPerson: number }>;
}

/** Sums all six spec buckets (Accommodation + Transportation + Staff Costs +
 * Restaurant Costs + Activity Fees [here: lineItems] + Visa Costs) for the
 * departure's FULL reference group, not per seat -- staff/transport costs
 * are genuinely shared across the whole group, not multiplied per person.
 * Per-person buckets (meals, line items, visa) are scaled by
 * referenceGroupSize; accommodation/transport/staff are not (they're
 * already whole-group figures: nights*rooms, days*vehicle, days*rate). */
export function computeBaseCostMinor(inputs: CostInputs): number {
  const accommodation = (inputs.hotelNightlyRateMinor ?? 0) * inputs.nights * inputs.roomsNeeded;

  const transport = inputs.transportRate
    ? (inputs.transportRate.fuelEstimateMinor +
        inputs.transportRate.tollFeesMinor +
        inputs.transportRate.parkingFeesMinor +
        inputs.transportRate.vehicleOperatingCostMinor) *
      inputs.transportDays
    : 0;

  const staff =
    (inputs.driverDailyRateMinor ?? 0) * inputs.driverDays +
    (inputs.guideDailyRateMinor ?? 0) * inputs.guideDays +
    (inputs.photographerDailyRateMinor ?? 0) * inputs.photographerDays +
    (inputs.videographerDailyRateMinor ?? 0) * inputs.videographerDays;

  const restaurant =
    ((inputs.breakfastRateMinor ?? 0) * inputs.breakfastCount +
      (inputs.lunchRateMinor ?? 0) * inputs.lunchCount +
      (inputs.dinnerRateMinor ?? 0) * inputs.dinnerCount) *
    inputs.referenceGroupSize;

  const lineItemsTotal =
    inputs.lineItems.reduce((sum, li) => sum + li.perUnitMinor * li.quantityPerPerson, 0) * inputs.referenceGroupSize;

  const visa =
    inputs.requiresVisa && inputs.immigrationCostRate
      ? (inputs.immigrationCostRate.visaFeeMinor +
          inputs.immigrationCostRate.processingFeeMinor +
          inputs.immigrationCostRate.invitationLetterFeeMinor +
          inputs.immigrationCostRate.borderPermitFeeMinor) *
        inputs.referenceGroupSize
      : 0;

  return Math.round(accommodation + transport + staff + restaurant + lineItemsTotal + visa);
}

/** Base Cost + Agency Margin = Selling Price, for the full reference group. */
export function computeSellingPriceMinor(baseCostMinor: number, agencyMarginBp: number): number {
  return Math.round(baseCostMinor * (1 + agencyMarginBp / 10000));
}

/** Ceil, never floor -- rounding down would silently underprice every seat
 * by a fraction, losing money on every departure at that group size. */
export function perSeatPriceMinor(sellingPriceTotalMinor: number, referenceGroupSize: number): number {
  if (referenceGroupSize <= 0) throw new Error('referenceGroupSize must be positive');
  return Math.ceil(sellingPriceTotalMinor / referenceGroupSize);
}

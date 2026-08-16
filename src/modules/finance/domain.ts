// finance module — domain types & rules. Pure; no framework or DB imports.
// Finance Module (DR-039) -- a cost-plus pricing engine replacing
// TourPackage.priceMinor as a plain staff-typed number. Seven platform-wide,
// effective-dated rate tables (mirrors TaxRate's precedent exactly; DR-126
// added the seventh, AdminCostRate) feed the per-package/booking cost
// breakdown itself; "seasonal pricing" is expressed as overlapping
// date-ranged rows, no separate season concept. DR-128 adds an eighth,
// AddonRate -- a separate concept (prices catalog's AddonService add-ons,
// not a cost-breakdown bucket), managed on the same Operational Rates page
// for consistency but resolved via src/lib/addon-rates.ts, not
// computeBaseCostMinor.
import type { AddonCode, Currency, FoodBeverageCategory, StaffRateRole } from '@prisma/client';
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
  hotelId: string | null;
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
  activityId: string | null;
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

// DR-126: a flat per-day admin overhead fee, one active row per country
// (auto-resolved by country + effective date, same as StaffRate -- no id is
// ever staff-picked from a dropdown for this rate).
export interface AdminCostRateView {
  id: string;
  country: string;
  dailyRateMinor: number;
  currency: Currency;
  validFrom: Date;
  validTo: Date | null;
}

export const AdminCostBasis = z.enum(['PER_PERSON', 'PER_GROUP']);
export type AdminCostBasis = z.infer<typeof AdminCostBasis>;

// DR-128: prices a catalog AddonService by (country, code), auto-resolved
// same as StaffRate/AdminCostRate -- AddonCode is a small fixed enum
// (PHOTOGRAPHY/VIDEOGRAPHY/TRANSLATOR/VISA_ASSISTANCE), not a list of
// distinct instances, so no FK to a specific AddonService row is needed.
export interface AddonRateView {
  id: string;
  country: string;
  code: AddonCode;
  priceMinor: number;
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
  // DR-116: required going forward -- staff must pick a real Hotel (from the
  // itinerary module's reference list) rather than pricing a bare room
  // category in the abstract. Existing pre-DR-116 rows keep a null hotelId.
  hotelId: z.string().uuid(),
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

// DR-116: `name` is no longer staff-typed here -- it's derived server-side
// from the selected Activity (a reusable, staff-managed reference list
// under Settings > Sites) so the same real attraction is never re-typed
// slightly differently across rows. Same "required going forward, nullable
// for pre-DR-116 rows" precedent as CreateHotelRateInput.hotelId.
export const CreateActivityFeeInput = z.object({
  country: z.string().length(2),
  activityId: z.string().uuid(),
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

export const CreateAdminCostRateInput = z.object({
  country: z.string().length(2),
  dailyRateMinor: z.number().int().nonnegative(),
  currency: CURRENCY_ENUM,
  ...EFFECTIVE_DATING,
});
export type CreateAdminCostRateInput = z.infer<typeof CreateAdminCostRateInput>;

export const CreateAddonRateInput = z.object({
  country: z.string().length(2),
  code: z.enum(['PHOTOGRAPHY', 'VIDEOGRAPHY', 'TRANSLATOR', 'VISA_ASSISTANCE']),
  priceMinor: z.number().int().nonnegative(),
  currency: CURRENCY_ENUM,
  ...EFFECTIVE_DATING,
});
export type CreateAddonRateInput = z.infer<typeof CreateAddonRateInput>;

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
  adminDays: number;
  adminCostBasis: AdminCostBasis;
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
    adminDays: z.number().int().nonnegative().default(0),
    adminCostBasis: AdminCostBasis.default('PER_GROUP'),
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
  // DR-126
  adminDays: number;
  adminDailyRateMinor: number | null;
  adminCostBasis: AdminCostBasis;
}

/** Sums all seven spec buckets (Accommodation + Transportation + Staff Costs +
 * Restaurant Costs + Activity Fees [here: lineItems] + Visa Costs + Admin
 * Costs) for the departure's FULL reference group, not per seat --
 * staff/transport costs are genuinely shared across the whole group, not
 * multiplied per person. Per-person buckets (meals, line items, visa) are
 * scaled by referenceGroupSize; accommodation/transport/staff are not
 * (they're already whole-group figures: nights*rooms, days*vehicle,
 * days*rate). Admin cost is whichever of the two the caller chose
 * (adminCostBasis): PER_GROUP behaves like staff/transport (charged once),
 * PER_PERSON behaves like restaurant/visa (scaled by referenceGroupSize). */
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

  const adminCost =
    (inputs.adminDailyRateMinor ?? 0) * inputs.adminDays * (inputs.adminCostBasis === 'PER_PERSON' ? inputs.referenceGroupSize : 1);

  return Math.round(accommodation + transport + staff + restaurant + lineItemsTotal + visa + adminCost);
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

// ----------------------------------------------------- booking cost breakdown

export interface BookingCostLineItemView {
  id: string;
  foodBeverageRateId: string | null;
  activityFeeId: string | null;
  quantityPerPerson: number;
}

export interface BookingCostBreakdownView {
  id: string;
  organizationId: string;
  bookingId: string;
  currency: Currency;
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
  adminDays: number;
  adminCostBasis: AdminCostBasis;
  agencyMarginBp: number;
  computedBaseCostMinor: number | null;
  computedSellingPriceMinor: number | null;
  addonsTotalMinor: number;
  overridePriceMinor: number | null;
  overrideReason: string | null;
  overriddenByUserId: string | null;
  overriddenAt: Date | null;
  lineItems: BookingCostLineItemView[];
  // Not persisted as its own column -- derived by the repository mapper from
  // the other fields already on this view.
  suggestedTotalMinor: number | null;
}

// Same shape as SaveCostBreakdownInput minus referenceGroupSize/currency --
// both are computed server-side for a booking (seats come from the booking
// itself, currency is derived from whichever rates/add-ons actually resolve),
// never caller-supplied.
export const SaveBookingCostBreakdownInput = z
  .object({
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
    adminDays: z.number().int().nonnegative().default(0),
    adminCostBasis: AdminCostBasis.default('PER_GROUP'),
    agencyMarginBp: z.number().int().min(0),
    lineItems: z.array(LineItemInput).optional().default([]),
    overridePriceMinor: z.number().int().nonnegative().optional(),
    overrideReason: z.string().min(1).max(500).optional(),
  })
  .refine((v) => (v.overridePriceMinor == null) === (v.overrideReason == null), {
    message: 'overrideReason is required when overridePriceMinor is set (and only then)',
  });
export type SaveBookingCostBreakdownInput = z.infer<typeof SaveBookingCostBreakdownInput>;

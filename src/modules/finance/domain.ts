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

// DR-131: restaurant counterpart to HotelRateView -- see RestaurantRate's
// schema comment for why this is one flat daily rate rather than split into
// breakfast/lunch/dinner.
export interface RestaurantRateView {
  id: string;
  country: string;
  restaurantId: string;
  dailyRateMinor: number;
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

// DR-147: PHOTOGRAPHER/VIDEOGRAPHER removed from this role enum -- a
// photographer/videographer is a guest-facing add-on (AddonCode.PHOTOGRAPHY/
// VIDEOGRAPHY, priced via AddonRate above), not part of the operational
// Staff cost-plus bucket.
export const CreateStaffRateInput = z.object({
  country: z.string().length(2),
  role: z.enum(['DRIVER', 'GUIDE']),
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

export const CreateRestaurantRateInput = z.object({
  country: z.string().length(2),
  restaurantId: z.string().uuid(),
  dailyRateMinor: z.number().int().nonnegative(),
  currency: CURRENCY_ENUM,
  ...EFFECTIVE_DATING,
});
export type CreateRestaurantRateInput = z.infer<typeof CreateRestaurantRateInput>;

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

// DR-131: drinks only now (WATER/SOFT_DRINK/JUICE/LOCAL_BEVERAGE/ALCOHOLIC
// FoodBeverageRate categories) -- activities used to also be a line item
// here, but are now derived automatically from the Day Template instead of
// staff-picked (see PackageCostBreakdownView's own comment).
export interface PackageDrinkLineItemView {
  id: string;
  foodBeverageRateId: string;
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
  transportRateId: string | null;
  transportDays: number;
  requiresVisa: boolean;
  immigrationCostRateId: string | null;
  adminDays: number;
  adminCostBasis: AdminCostBasis;
  agencyMarginBp: number;
  // DR-131: read-only snapshots of the three Day-Template-derived buckets,
  // for display -- not independently settable; computedBaseCostMinor is
  // still the sum of record (accommodation + restaurant + activities +
  // transport + staff + drinks + visa + admin).
  computedAccommodationMinor: number | null;
  computedRestaurantMinor: number | null;
  computedActivitiesMinor: number | null;
  // Snapshot for the package summary PDF -- computeCostBuckets already
  // returns these at save time, just never persisted individually before
  // (unlike Accommodation/Restaurant/Activities above), only folded into
  // computedBaseCostMinor.
  computedTransportMinor: number | null;
  computedAdminMinor: number | null;
  computedBaseCostMinor: number | null;
  computedSellingPriceMinor: number | null;
  // DR-134: display/audit-trail snapshot of the tax + platform fee folded
  // into TourPackage.priceMinor (whole-group, like the computed*Minor
  // fields above) -- computedTotalMinor = computedSellingPriceMinor + tax +
  // platform fee. The two *RateBpSnapshot fields record whatever rate was
  // actually effective when this breakdown was last saved.
  computedTaxMinor: number | null;
  computedPlatformFeeMinor: number | null;
  computedTotalMinor: number | null;
  taxRateBpSnapshot: number | null;
  platformFeeRateBpSnapshot: number | null;
  overridePriceMinor: number | null;
  overrideReason: string | null;
  overriddenByUserId: string | null;
  overriddenAt: Date | null;
  drinkLineItems: PackageDrinkLineItemView[];
}

const DrinkLineItemInput = z.object({
  foodBeverageRateId: z.string().uuid(),
  quantityPerPerson: z.number().int().positive(),
});

// overrideReason is required together with overridePriceMinor (spec:
// "Administrators may override calculated prices when necessary while
// maintaining an audit trail") -- validated by the refine below, not just
// convention. DR-131: hotelRateId/roomsNeeded/breakfastCount/lunchCount/
// dinnerCount are gone -- accommodation/restaurant/activities are computed
// server-side from the package's own Day Template, never caller-supplied.
export const SaveCostBreakdownInput = z
  .object({
    currency: CURRENCY_ENUM,
    referenceGroupSize: z.number().int().positive(),
    nights: z.number().int().nonnegative(),
    driverDays: z.number().int().nonnegative(),
    guideDays: z.number().int().nonnegative(),
    transportRateId: z.string().uuid().optional(),
    transportDays: z.number().int().nonnegative().default(0),
    requiresVisa: z.boolean().default(false),
    immigrationCostRateId: z.string().uuid().optional(),
    adminDays: z.number().int().nonnegative().default(0),
    adminCostBasis: AdminCostBasis.default('PER_GROUP'),
    agencyMarginBp: z.number().int().min(0),
    drinkLineItems: z.array(DrinkLineItemInput).optional().default([]),
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
  driverDays: number;
  guideDays: number;
  driverDailyRateMinor: number | null;
  guideDailyRateMinor: number | null;
  // DR-131: one resolved rate per Day Template day that actually has the
  // corresponding entity assigned (hotelId/restaurantId/an activityId in
  // activityIds) -- already resolved to a flat minor-unit rate by the
  // caller (service.ts), since domain.ts touches no DB. Summed here, then
  // charged per-traveler (referenceGroupSize), replacing the old single
  // staff-picked hotelRateId * nights * roomsNeeded model and the old flat
  // breakfast/lunch/dinner counts.
  accommodationDailyRatesMinor: number[];
  restaurantDailyRatesMinor: number[];
  activityFeesMinor: number[];
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
  // Drinks only now (beyond-base FoodBeverageRate categories) -- activities
  // moved to activityFeesMinor above. Already resolved to a flat
  // perUnitMinor by the caller.
  drinkLineItems: Array<{ perUnitMinor: number; quantityPerPerson: number }>;
  // DR-126
  adminDays: number;
  adminDailyRateMinor: number | null;
  adminCostBasis: AdminCostBasis;
}

export interface CostBuckets {
  accommodationMinor: number;
  transportMinor: number;
  staffMinor: number;
  restaurantMinor: number;
  activitiesMinor: number;
  drinksMinor: number;
  visaMinor: number;
  adminMinor: number;
}

/** Every bucket individually, for both the total (computeBaseCostMinor,
 * which just sums these) and for display (the three Day-Template-derived
 * buckets are persisted on the breakdown row as computed*Minor snapshots).
 * Staff/transport/accommodation/restaurant/activities are all "shared, not
 * per-seat" in the sense that they're computed once for the trip -- but
 * unlike staff/transport (genuinely whole-group: days*rate), accommodation/
 * restaurant/activities/drinks/visa are per-traveler and scaled by
 * referenceGroupSize (DR-131: previously only drinks/activities/restaurant/
 * visa were; accommodation used to be a whole-group roomsNeeded figure).
 * Admin cost is whichever of the two the caller chose (adminCostBasis):
 * PER_GROUP behaves like staff/transport (charged once), PER_PERSON behaves
 * like the per-traveler buckets (scaled by referenceGroupSize). */
export function computeCostBuckets(inputs: CostInputs): CostBuckets {
  const accommodationMinor = inputs.accommodationDailyRatesMinor.reduce((s, x) => s + x, 0) * inputs.referenceGroupSize;

  const transportMinor = inputs.transportRate
    ? (inputs.transportRate.fuelEstimateMinor +
        inputs.transportRate.tollFeesMinor +
        inputs.transportRate.parkingFeesMinor +
        inputs.transportRate.vehicleOperatingCostMinor) *
      inputs.transportDays
    : 0;

  const staffMinor = (inputs.driverDailyRateMinor ?? 0) * inputs.driverDays + (inputs.guideDailyRateMinor ?? 0) * inputs.guideDays;

  const restaurantMinor = inputs.restaurantDailyRatesMinor.reduce((s, x) => s + x, 0) * inputs.referenceGroupSize;

  const activitiesMinor = inputs.activityFeesMinor.reduce((s, x) => s + x, 0) * inputs.referenceGroupSize;

  const drinksMinor =
    inputs.drinkLineItems.reduce((sum, li) => sum + li.perUnitMinor * li.quantityPerPerson, 0) * inputs.referenceGroupSize;

  const visaMinor =
    inputs.requiresVisa && inputs.immigrationCostRate
      ? (inputs.immigrationCostRate.visaFeeMinor +
          inputs.immigrationCostRate.processingFeeMinor +
          inputs.immigrationCostRate.invitationLetterFeeMinor +
          inputs.immigrationCostRate.borderPermitFeeMinor) *
        inputs.referenceGroupSize
      : 0;

  const adminMinor =
    (inputs.adminDailyRateMinor ?? 0) * inputs.adminDays * (inputs.adminCostBasis === 'PER_PERSON' ? inputs.referenceGroupSize : 1);

  return { accommodationMinor, transportMinor, staffMinor, restaurantMinor, activitiesMinor, drinksMinor, visaMinor, adminMinor };
}

/** Sums all eight buckets for the departure's FULL reference group (not per
 * seat) -- see computeCostBuckets for how each one is derived. */
export function computeBaseCostMinor(inputs: CostInputs): number {
  const b = computeCostBuckets(inputs);
  return Math.round(b.accommodationMinor + b.transportMinor + b.staffMinor + b.restaurantMinor + b.activitiesMinor + b.drinksMinor + b.visaMinor + b.adminMinor);
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

/** A combo package/booking's Day Template can span more than one country's
 * hotels -- blends each distinct country's own effective tax rate, weighted
 * by how many Day Template nights that country's hotel covers, instead of
 * taxing the whole trip at a single country's rate. Callers only invoke
 * this once there are 2+ distinct countries (a single country is just that
 * country's own rate, resolved directly with no blending needed), so
 * `nightsByCountry` is always non-empty here. */
export function blendedTaxRateBp(nightsByCountry: Array<{ nights: number; rateBp: number }>): number {
  const totalNights = nightsByCountry.reduce((sum, c) => sum + c.nights, 0);
  const weightedSum = nightsByCountry.reduce((sum, c) => sum + c.nights * c.rateBp, 0);
  return Math.round(weightedSum / totalNights);
}

// ----------------------------------------------------- booking cost breakdown

export interface BookingDrinkLineItemView {
  id: string;
  foodBeverageRateId: string;
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
  transportRateId: string | null;
  transportDays: number;
  requiresVisa: boolean;
  immigrationCostRateId: string | null;
  adminDays: number;
  adminCostBasis: AdminCostBasis;
  agencyMarginBp: number;
  computedAccommodationMinor: number | null;
  computedRestaurantMinor: number | null;
  computedActivitiesMinor: number | null;
  computedBaseCostMinor: number | null;
  computedSellingPriceMinor: number | null;
  addonsTotalMinor: number;
  overridePriceMinor: number | null;
  overrideReason: string | null;
  overriddenByUserId: string | null;
  overriddenAt: Date | null;
  drinkLineItems: BookingDrinkLineItemView[];
  // Not persisted as its own column -- derived by the repository mapper from
  // the other fields already on this view.
  suggestedTotalMinor: number | null;
}

// Same shape as SaveCostBreakdownInput minus referenceGroupSize/currency --
// both are computed server-side for a booking (seats come from the booking
// itself, currency is derived from whichever rates/add-ons actually resolve),
// never caller-supplied. DR-131: same hotelRateId/roomsNeeded/breakfastCount/
// lunchCount/dinnerCount removal as SaveCostBreakdownInput -- derived from
// the linked customized package's Day Template instead (0 if unset).
export const SaveBookingCostBreakdownInput = z
  .object({
    nights: z.number().int().nonnegative(),
    driverDays: z.number().int().nonnegative(),
    guideDays: z.number().int().nonnegative(),
    transportRateId: z.string().uuid().optional(),
    transportDays: z.number().int().nonnegative().default(0),
    requiresVisa: z.boolean().default(false),
    immigrationCostRateId: z.string().uuid().optional(),
    adminDays: z.number().int().nonnegative().default(0),
    adminCostBasis: AdminCostBasis.default('PER_GROUP'),
    agencyMarginBp: z.number().int().min(0),
    drinkLineItems: z.array(DrinkLineItemInput).optional().default([]),
    overridePriceMinor: z.number().int().nonnegative().optional(),
    overrideReason: z.string().min(1).max(500).optional(),
  })
  .refine((v) => (v.overridePriceMinor == null) === (v.overrideReason == null), {
    message: 'overrideReason is required when overridePriceMinor is set (and only then)',
  });
export type SaveBookingCostBreakdownInput = z.infer<typeof SaveBookingCostBreakdownInput>;

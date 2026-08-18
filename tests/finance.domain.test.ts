import { describe, it, expect } from 'vitest';
import { blendedTaxRateBp, computeBaseCostMinor, computeCostBuckets, computeSellingPriceMinor, perSeatPriceMinor } from '../src/modules/finance/domain';
import type { CostInputs } from '../src/modules/finance/domain';

// DR-131: accommodation/restaurant/activities are now derived from the Day
// Template (one resolved rate per day/activity assignment, summed then
// scaled by referenceGroupSize -- per-traveler, not the old whole-group
// nights*roomsNeeded/flat-meal-count model).
const BASE_INPUTS: CostInputs = {
  referenceGroupSize: 10,
  driverDays: 4,
  guideDays: 4,
  photographerDays: 0,
  videographerDays: 0,
  driverDailyRateMinor: 10000, // $100/day
  guideDailyRateMinor: 8000, // $80/day
  photographerDailyRateMinor: null,
  videographerDailyRateMinor: null,
  accommodationDailyRatesMinor: [5000, 5000, 5000, 5000], // 4 Day Template days with a hotel assigned, $50/day each
  restaurantDailyRatesMinor: [1000, 1000, 1000, 1000], // 4 Day Template days with a restaurant assigned, $10/day each
  activityFeesMinor: [3000, 2000], // 2 activities assigned across the Day Template
  transportDays: 4,
  transportRate: { fuelEstimateMinor: 3000, tollFeesMinor: 500, parkingFeesMinor: 200, vehicleOperatingCostMinor: 1000 },
  requiresVisa: false,
  immigrationCostRate: null,
  drinkLineItems: [],
  adminDays: 0,
  adminDailyRateMinor: null,
  adminCostBasis: 'PER_GROUP',
};

describe('finance domain', () => {
  describe('computeBaseCostMinor', () => {
    it('sums accommodation + transport + staff + restaurant + activities for a full example', () => {
      // accommodation: (5000+5000+5000+5000) * 10 people = 200000
      // transport: (3000+500+200+1000) * 4 days = 18800
      // staff: 10000*4 + 8000*4 = 72000
      // restaurant: (1000+1000+1000+1000) * 10 people = 40000
      // activities: (3000+2000) * 10 people = 50000
      // total = 200000 + 18800 + 72000 + 40000 + 50000 = 380800
      expect(computeBaseCostMinor(BASE_INPUTS)).toBe(380800);
    });

    it('is 0 for a fully-empty input (no hotel/restaurant/activity days, no transport, no staff)', () => {
      const empty: CostInputs = {
        ...BASE_INPUTS,
        driverDays: 0,
        guideDays: 0,
        driverDailyRateMinor: null,
        guideDailyRateMinor: null,
        accommodationDailyRatesMinor: [],
        restaurantDailyRatesMinor: [],
        activityFeesMinor: [],
        transportDays: 0,
        transportRate: null,
      };
      expect(computeBaseCostMinor(empty)).toBe(0);
    });

    it('adds visa costs only when requiresVisa is true and a rate is provided', () => {
      const withVisa: CostInputs = {
        ...BASE_INPUTS,
        requiresVisa: true,
        immigrationCostRate: { visaFeeMinor: 5000, processingFeeMinor: 1000, invitationLetterFeeMinor: 500, borderPermitFeeMinor: 200 },
      };
      // visa: (5000+1000+500+200) * 10 = 67000, added on top of the 380800 base
      expect(computeBaseCostMinor(withVisa)).toBe(380800 + 67000);

      const requiresVisaButNoRate: CostInputs = { ...BASE_INPUTS, requiresVisa: true, immigrationCostRate: null };
      expect(computeBaseCostMinor(requiresVisaButNoRate)).toBe(380800); // unchanged -- no rate, no cost added
    });

    it('scales drink line items by referenceGroupSize', () => {
      const withDrinks: CostInputs = {
        ...BASE_INPUTS,
        drinkLineItems: [{ perUnitMinor: 200, quantityPerPerson: 2 }],
      };
      // drinks: (200*2) * 10 people = 4000, added on top
      expect(computeBaseCostMinor(withDrinks)).toBe(380800 + 4000);
    });

    it('does not multiply staff/transport by referenceGroupSize (genuinely whole-group, not per-traveler)', () => {
      const staffTransportOnly: CostInputs = {
        ...BASE_INPUTS,
        referenceGroupSize: 2,
        accommodationDailyRatesMinor: [],
        restaurantDailyRatesMinor: [],
        activityFeesMinor: [],
      };
      // transport (18800) + staff (72000) unaffected by group size
      expect(computeBaseCostMinor(staffTransportOnly)).toBe(18800 + 72000);
    });

    it('DOES multiply accommodation/restaurant/activities by referenceGroupSize (per-traveler, DR-131)', () => {
      const smallGroup: CostInputs = { ...BASE_INPUTS, referenceGroupSize: 2 };
      const buckets = computeCostBuckets(smallGroup);
      expect(buckets.accommodationMinor).toBe(20000 * 2); // 40000, vs 200000 at group size 10
      expect(buckets.restaurantMinor).toBe(4000 * 2); // 8000, vs 40000 at group size 10
      expect(buckets.activitiesMinor).toBe(5000 * 2); // 10000, vs 50000 at group size 10
    });

    it('charges admin cost once for the whole group under PER_GROUP', () => {
      const withAdminCost: CostInputs = { ...BASE_INPUTS, adminDays: 4, adminDailyRateMinor: 1000, adminCostBasis: 'PER_GROUP' };
      // admin: 1000 * 4 days = 4000 (referenceGroupSize of 10 has no effect), added on top
      expect(computeBaseCostMinor(withAdminCost)).toBe(380800 + 4000);
    });

    it('scales admin cost by referenceGroupSize under PER_PERSON', () => {
      const withAdminCost: CostInputs = { ...BASE_INPUTS, adminDays: 4, adminDailyRateMinor: 1000, adminCostBasis: 'PER_PERSON' };
      // admin: 1000 * 4 days * 10 people = 40000, added on top
      expect(computeBaseCostMinor(withAdminCost)).toBe(380800 + 40000);
    });

    it('adds no admin cost when adminDays is 0 or no rate is provided', () => {
      expect(computeBaseCostMinor({ ...BASE_INPUTS, adminDays: 0, adminDailyRateMinor: 1000 })).toBe(380800);
      expect(computeBaseCostMinor({ ...BASE_INPUTS, adminDays: 4, adminDailyRateMinor: null })).toBe(380800);
    });
  });

  describe('computeCostBuckets', () => {
    it('breaks the total down into the same buckets computeBaseCostMinor sums', () => {
      const buckets = computeCostBuckets(BASE_INPUTS);
      expect(buckets.accommodationMinor).toBe(200000);
      expect(buckets.restaurantMinor).toBe(40000);
      expect(buckets.activitiesMinor).toBe(50000);
      expect(buckets.transportMinor).toBe(18800);
      expect(buckets.staffMinor).toBe(72000);
      expect(buckets.drinksMinor).toBe(0);
      expect(buckets.visaMinor).toBe(0);
      expect(buckets.adminMinor).toBe(0);
      const sum =
        buckets.accommodationMinor +
        buckets.transportMinor +
        buckets.staffMinor +
        buckets.restaurantMinor +
        buckets.activitiesMinor +
        buckets.drinksMinor +
        buckets.visaMinor +
        buckets.adminMinor;
      expect(sum).toBe(computeBaseCostMinor(BASE_INPUTS));
    });
  });

  describe('computeSellingPriceMinor', () => {
    it('applies a basis-point margin over base cost', () => {
      expect(computeSellingPriceMinor(100000, 2000)).toBe(120000); // 20%
      expect(computeSellingPriceMinor(100000, 0)).toBe(100000);
    });
  });

  describe('perSeatPriceMinor', () => {
    it('divides the total selling price by the reference group size', () => {
      expect(perSeatPriceMinor(100000, 10)).toBe(10000);
    });

    it('rounds up (ceil), never underpricing a seat', () => {
      expect(perSeatPriceMinor(100001, 10)).toBe(10001); // would be 10000.1, ceil to 10001
      expect(perSeatPriceMinor(100000, 3)).toBe(33334); // 33333.33... -> 33334
    });

    it('throws for a non-positive group size', () => {
      expect(() => perSeatPriceMinor(100000, 0)).toThrow();
      expect(() => perSeatPriceMinor(100000, -1)).toThrow();
    });
  });

  describe('blendedTaxRateBp', () => {
    it('returns the single rate unchanged for a single-country breakdown', () => {
      expect(blendedTaxRateBp([{ nights: 7, rateBp: 1500 }])).toBe(1500);
    });

    it('weights each country by its own night count', () => {
      // 5 nights at 15% + 5 nights at 16% -> 15.5%, an even split
      expect(blendedTaxRateBp([{ nights: 5, rateBp: 1500 }, { nights: 5, rateBp: 1600 }])).toBe(1550);
    });

    it('skews toward whichever country has more nights', () => {
      // 8 nights at 15% + 2 nights at 16% -> 15.2%
      expect(blendedTaxRateBp([{ nights: 8, rateBp: 1500 }, { nights: 2, rateBp: 1600 }])).toBe(1520);
    });

    it('rounds to the nearest whole basis point', () => {
      // 1 night at 15% + 2 nights at 16% -> 15.666...% -> rounds to 1567
      expect(blendedTaxRateBp([{ nights: 1, rateBp: 1500 }, { nights: 2, rateBp: 1600 }])).toBe(1567);
    });
  });
});

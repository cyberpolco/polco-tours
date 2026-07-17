import { describe, it, expect } from 'vitest';
import { computeBaseCostMinor, computeSellingPriceMinor, perSeatPriceMinor } from '../src/modules/finance/domain';
import type { CostInputs } from '../src/modules/finance/domain';

const BASE_INPUTS: CostInputs = {
  referenceGroupSize: 10,
  nights: 4,
  driverDays: 4,
  guideDays: 4,
  photographerDays: 0,
  videographerDays: 0,
  driverDailyRateMinor: 10000, // $100/day
  guideDailyRateMinor: 8000, // $80/day
  photographerDailyRateMinor: null,
  videographerDailyRateMinor: null,
  hotelNightlyRateMinor: 5000, // $50/night/room
  roomsNeeded: 5,
  breakfastCount: 4,
  lunchCount: 4,
  dinnerCount: 4,
  breakfastRateMinor: 1000, // $10/person
  lunchRateMinor: 1500,
  dinnerRateMinor: 2000,
  transportDays: 4,
  transportRate: { fuelEstimateMinor: 3000, tollFeesMinor: 500, parkingFeesMinor: 200, vehicleOperatingCostMinor: 1000 },
  requiresVisa: false,
  immigrationCostRate: null,
  lineItems: [],
};

describe('finance domain', () => {
  describe('computeBaseCostMinor', () => {
    it('sums accommodation + transport + staff + restaurant for a full example', () => {
      // accommodation: 5000 * 4 nights * 5 rooms = 100000
      // transport: (3000+500+200+1000) * 4 days = 18800
      // staff: 10000*4 + 8000*4 = 72000
      // restaurant: (1000*4 + 1500*4 + 2000*4) * 10 people = 180000
      // total = 100000 + 18800 + 72000 + 180000 = 370800
      expect(computeBaseCostMinor(BASE_INPUTS)).toBe(370800);
    });

    it('is 0 for a fully-empty input (no hotel, no transport, no staff, no meals)', () => {
      const empty: CostInputs = {
        ...BASE_INPUTS,
        driverDays: 0,
        guideDays: 0,
        driverDailyRateMinor: null,
        guideDailyRateMinor: null,
        hotelNightlyRateMinor: null,
        breakfastCount: 0,
        lunchCount: 0,
        dinnerCount: 0,
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
      // visa: (5000+1000+500+200) * 10 = 67000, added on top of the 370800 base
      expect(computeBaseCostMinor(withVisa)).toBe(370800 + 67000);

      const requiresVisaButNoRate: CostInputs = { ...BASE_INPUTS, requiresVisa: true, immigrationCostRate: null };
      expect(computeBaseCostMinor(requiresVisaButNoRate)).toBe(370800); // unchanged -- no rate, no cost added
    });

    it('scales line items (drinks/activities) by referenceGroupSize', () => {
      const withLineItems: CostInputs = {
        ...BASE_INPUTS,
        lineItems: [
          { perUnitMinor: 200, quantityPerPerson: 2 }, // water
          { perUnitMinor: 5000, quantityPerPerson: 1 }, // an activity
        ],
      };
      // lineItems: (200*2 + 5000*1) * 10 people = 54000, added on top
      expect(computeBaseCostMinor(withLineItems)).toBe(370800 + 54000);
    });

    it('does not multiply staff/transport/accommodation by referenceGroupSize (shared, not per-person)', () => {
      const smallGroup: CostInputs = { ...BASE_INPUTS, referenceGroupSize: 2, breakfastCount: 0, lunchCount: 0, dinnerCount: 0 };
      // accommodation (100000) + transport (18800) + staff (72000) unaffected by group size
      expect(computeBaseCostMinor(smallGroup)).toBe(100000 + 18800 + 72000);
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
});

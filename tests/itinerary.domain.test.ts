import { describe, it, expect } from 'vitest';
import {
  AddItineraryDayInput,
  canTransition,
  CreateHotelInput,
  CreateSiteInput,
} from '../src/modules/itinerary/domain';

describe('itinerary domain', () => {
  describe('CreateSiteInput (DR-086)', () => {
    it('accepts a real province of one of the 4 operating countries', () => {
      expect(CreateSiteInput.safeParse({ name: 'Etosha Gate', country: 'NA', province: 'Kunene' }).success).toBe(true);
      expect(CreateSiteInput.safeParse({ name: 'Virunga Gate', country: 'CD', province: 'Nord-Kivu' }).success).toBe(true);
    });

    it('rejects a country outside the 4 operating countries', () => {
      expect(CreateSiteInput.safeParse({ name: 'Somewhere', country: 'ZA', province: 'Gauteng' }).success).toBe(false);
    });

    it('rejects a province that does not belong to the selected country', () => {
      // Gauteng is a real South African province, not a Namibian region.
      expect(CreateSiteInput.safeParse({ name: 'Etosha Gate', country: 'NA', province: 'Gauteng' }).success).toBe(false);
    });

    it('accepts an optional latitude/longitude within range (DR-088)', () => {
      expect(
        CreateSiteInput.safeParse({ name: 'Etosha Gate', country: 'NA', province: 'Kunene', latitude: -18.8, longitude: 16.3 }).success,
      ).toBe(true);
    });

    it('rejects a latitude/longitude outside the real coordinate range (DR-088)', () => {
      expect(
        CreateSiteInput.safeParse({ name: 'Etosha Gate', country: 'NA', province: 'Kunene', latitude: 200, longitude: 16.3 }).success,
      ).toBe(false);
      expect(
        CreateSiteInput.safeParse({ name: 'Etosha Gate', country: 'NA', province: 'Kunene', latitude: -18.8, longitude: 400 }).success,
      ).toBe(false);
    });
  });

  describe('CreateHotelInput (DR-088)', () => {
    it('accepts an optional latitude/longitude within range', () => {
      expect(CreateHotelInput.safeParse({ name: 'Etosha Safari Lodge', country: 'NA', latitude: -18.8, longitude: 16.3 }).success).toBe(
        true,
      );
    });

    it('accepts no coordinates at all -- both stay genuinely optional', () => {
      expect(CreateHotelInput.safeParse({ name: 'Etosha Safari Lodge', country: 'NA' }).success).toBe(true);
    });

    it('rejects an out-of-range latitude/longitude', () => {
      expect(CreateHotelInput.safeParse({ name: 'Etosha Safari Lodge', country: 'NA', latitude: -100, longitude: 16.3 }).success).toBe(
        false,
      );
    });
  });

  describe('AddItineraryDayInput (DR-088)', () => {
    it('no longer accepts plannedSites -- replaced by the structured ItineraryDaySite relation', () => {
      const parsed = AddItineraryDayInput.safeParse({ date: '2026-09-01', plannedSites: 'Airport pickup' });
      expect(parsed.success).toBe(true);
      // zod strips unknown keys by default -- plannedSites silently drops
      // out rather than failing validation, confirming it's genuinely gone
      // from the schema (not just made optional).
      if (parsed.success) expect('plannedSites' in parsed.data).toBe(false);
    });

    it('accepts independent pickup/dropoff coordinates alongside the existing free-text location fields', () => {
      const parsed = AddItineraryDayInput.safeParse({
        date: '2026-09-01',
        pickupLocation: 'Hosea Kutako International Airport',
        pickupLatitude: -22.48,
        pickupLongitude: 17.47,
        dropoffLatitude: -22.56,
        dropoffLongitude: 17.08,
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects an out-of-range pickup coordinate', () => {
      expect(AddItineraryDayInput.safeParse({ date: '2026-09-01', pickupLatitude: -100, pickupLongitude: 17.47 }).success).toBe(false);
    });
  });

  describe('canTransition', () => {
    it('DRAFT can go to IN_REVIEW or straight to APPROVED', () => {
      expect(canTransition('DRAFT', 'IN_REVIEW')).toBe(true);
      expect(canTransition('DRAFT', 'APPROVED')).toBe(true);
    });

    it('IN_REVIEW can go to APPROVED or back to DRAFT', () => {
      expect(canTransition('IN_REVIEW', 'APPROVED')).toBe(true);
      expect(canTransition('IN_REVIEW', 'DRAFT')).toBe(true);
    });

    it('APPROVED is terminal -- no path out', () => {
      expect(canTransition('APPROVED', 'DRAFT')).toBe(false);
      expect(canTransition('APPROVED', 'IN_REVIEW')).toBe(false);
    });

    it('cannot transition to the same status', () => {
      expect(canTransition('DRAFT', 'DRAFT')).toBe(false);
      expect(canTransition('IN_REVIEW', 'IN_REVIEW')).toBe(false);
      expect(canTransition('APPROVED', 'APPROVED')).toBe(false);
    });
  });
});

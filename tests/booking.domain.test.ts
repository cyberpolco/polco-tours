import { describe, it, expect } from 'vitest';
import {
  HOLD_DURATION_MINUTES,
  holdExpiryFrom,
  isHoldExpired,
  occupiesCapacity,
  computeAvailability,
  canTransition,
  canAddTraveler,
  hasExactlyOneTourLead,
  isTravelerManifestComplete,
  generateBookingReference,
  lastNameMatches,
  toTravelerDutyView,
  CreateTailorMadeInput,
  type TravelerView,
} from '../src/modules/booking/domain';

describe('booking domain', () => {
  describe('holdExpiryFrom', () => {
    it('adds the hold duration to the given time', () => {
      const now = new Date('2026-01-01T00:00:00Z');
      const expiry = holdExpiryFrom(now);
      expect(expiry.getTime() - now.getTime()).toBe(HOLD_DURATION_MINUTES * 60 * 1000);
    });
  });

  describe('isHoldExpired', () => {
    const now = new Date('2026-01-01T00:30:00Z');

    it('is false for a non-AWAITING_DEPOSIT booking regardless of holdExpiresAt', () => {
      expect(isHoldExpired({ status: 'CONFIRMED', holdExpiresAt: new Date('2026-01-01T00:00:00Z') }, now)).toBe(
        false,
      );
    });

    it('is false for an AWAITING_DEPOSIT booking with no expiry set (e.g. a TAILOR_MADE booking)', () => {
      expect(isHoldExpired({ status: 'AWAITING_DEPOSIT', holdExpiresAt: null }, now)).toBe(false);
    });

    it('is true once the hold window has passed', () => {
      expect(isHoldExpired({ status: 'AWAITING_DEPOSIT', holdExpiresAt: new Date('2026-01-01T00:29:59Z') }, now)).toBe(true);
    });

    it('is false right up to the expiry instant, true at it', () => {
      expect(isHoldExpired({ status: 'AWAITING_DEPOSIT', holdExpiresAt: new Date('2026-01-01T00:30:01Z') }, now)).toBe(false);
      expect(isHoldExpired({ status: 'AWAITING_DEPOSIT', holdExpiresAt: now }, now)).toBe(true);
    });
  });

  describe('occupiesCapacity', () => {
    const now = new Date('2026-01-01T00:30:00Z');

    it('CONFIRMED, IN_PROGRESS, DEPOSIT_PAID, and FULLY_PAID always occupy a seat', () => {
      expect(occupiesCapacity({ status: 'CONFIRMED', holdExpiresAt: null }, now)).toBe(true);
      expect(occupiesCapacity({ status: 'IN_PROGRESS', holdExpiresAt: null }, now)).toBe(true);
      expect(occupiesCapacity({ status: 'DEPOSIT_PAID', holdExpiresAt: null }, now)).toBe(true);
      expect(occupiesCapacity({ status: 'FULLY_PAID', holdExpiresAt: null }, now)).toBe(true);
    });

    it('a non-expired AWAITING_DEPOSIT booking occupies a seat', () => {
      expect(occupiesCapacity({ status: 'AWAITING_DEPOSIT', holdExpiresAt: new Date('2026-01-01T01:00:00Z') }, now)).toBe(true);
    });

    it('an expired AWAITING_DEPOSIT booking does not occupy a seat', () => {
      expect(occupiesCapacity({ status: 'AWAITING_DEPOSIT', holdExpiresAt: new Date('2026-01-01T00:00:00Z') }, now)).toBe(false);
    });

    it('CANCELLED, REFUNDED, and COMPLETED never occupy a seat', () => {
      expect(occupiesCapacity({ status: 'CANCELLED', holdExpiresAt: null }, now)).toBe(false);
      expect(occupiesCapacity({ status: 'REFUNDED', holdExpiresAt: null }, now)).toBe(false);
      expect(occupiesCapacity({ status: 'COMPLETED', holdExpiresAt: null }, now)).toBe(false);
    });

    it('AWAITING_QUOTATION/QUOTATION_SENT never occupy a seat (DR-024)', () => {
      expect(occupiesCapacity({ status: 'AWAITING_QUOTATION', holdExpiresAt: null }, now)).toBe(false);
      expect(occupiesCapacity({ status: 'QUOTATION_SENT', holdExpiresAt: null }, now)).toBe(false);
    });
  });

  describe('computeAvailability', () => {
    it('subtracts seats taken from capacity', () => {
      expect(computeAvailability(10, 3)).toBe(7);
    });

    it('never goes negative', () => {
      expect(computeAvailability(10, 15)).toBe(0);
    });
  });

  describe('canTransition', () => {
    it('DRAFT can move to AWAITING_QUOTATION, AWAITING_DEPOSIT, or CANCELLED', () => {
      expect(canTransition('DRAFT', 'AWAITING_QUOTATION')).toBe(true);
      expect(canTransition('DRAFT', 'AWAITING_DEPOSIT')).toBe(true);
      expect(canTransition('DRAFT', 'CANCELLED')).toBe(true);
      expect(canTransition('DRAFT', 'CONFIRMED')).toBe(false);
    });

    it('AWAITING_QUOTATION can move to QUOTATION_SENT or CANCELLED, not straight to AWAITING_DEPOSIT', () => {
      expect(canTransition('AWAITING_QUOTATION', 'QUOTATION_SENT')).toBe(true);
      expect(canTransition('AWAITING_QUOTATION', 'CANCELLED')).toBe(true);
      expect(canTransition('AWAITING_QUOTATION', 'AWAITING_DEPOSIT')).toBe(false);
    });

    it('QUOTATION_SENT can move to AWAITING_DEPOSIT (accepted) or CANCELLED', () => {
      expect(canTransition('QUOTATION_SENT', 'AWAITING_DEPOSIT')).toBe(true);
      expect(canTransition('QUOTATION_SENT', 'CANCELLED')).toBe(true);
      expect(canTransition('QUOTATION_SENT', 'CONFIRMED')).toBe(false);
    });

    it('AWAITING_DEPOSIT (the hold) can move to DEPOSIT_PAID, FULLY_PAID, or CANCELLED', () => {
      expect(canTransition('AWAITING_DEPOSIT', 'DEPOSIT_PAID')).toBe(true);
      expect(canTransition('AWAITING_DEPOSIT', 'FULLY_PAID')).toBe(true);
      expect(canTransition('AWAITING_DEPOSIT', 'CANCELLED')).toBe(true);
      expect(canTransition('AWAITING_DEPOSIT', 'CONFIRMED')).toBe(false);
    });

    it('DEPOSIT_PAID can move to FULLY_PAID, CONFIRMED, or CANCELLED', () => {
      expect(canTransition('DEPOSIT_PAID', 'FULLY_PAID')).toBe(true);
      expect(canTransition('DEPOSIT_PAID', 'CONFIRMED')).toBe(true);
      expect(canTransition('DEPOSIT_PAID', 'CANCELLED')).toBe(true);
    });

    it('FULLY_PAID can move to CONFIRMED or CANCELLED', () => {
      expect(canTransition('FULLY_PAID', 'CONFIRMED')).toBe(true);
      expect(canTransition('FULLY_PAID', 'CANCELLED')).toBe(true);
      expect(canTransition('FULLY_PAID', 'IN_PROGRESS')).toBe(false);
    });

    it('CONFIRMED can move to IN_PROGRESS or CANCELLED', () => {
      expect(canTransition('CONFIRMED', 'IN_PROGRESS')).toBe(true);
      expect(canTransition('CONFIRMED', 'CANCELLED')).toBe(true);
      expect(canTransition('CONFIRMED', 'COMPLETED')).toBe(false);
    });

    it('IN_PROGRESS can only move to COMPLETED (not CANCELLED -- a trip already underway)', () => {
      expect(canTransition('IN_PROGRESS', 'COMPLETED')).toBe(true);
      expect(canTransition('IN_PROGRESS', 'CANCELLED')).toBe(false);
    });

    it('COMPLETED is terminal', () => {
      expect(canTransition('COMPLETED', 'CANCELLED')).toBe(false);
      expect(canTransition('COMPLETED', 'REFUNDED')).toBe(false);
    });

    it('CANCELLED can only move to REFUNDED', () => {
      expect(canTransition('CANCELLED', 'REFUNDED')).toBe(true);
      expect(canTransition('CANCELLED', 'CONFIRMED')).toBe(false);
      expect(canTransition('CANCELLED', 'AWAITING_DEPOSIT')).toBe(false);
    });

    it('REFUNDED is terminal', () => {
      expect(canTransition('REFUNDED', 'CANCELLED')).toBe(false);
      expect(canTransition('REFUNDED', 'CONFIRMED')).toBe(false);
    });
  });

  describe('canAddTraveler', () => {
    it('allows adding while below the seat count', () => {
      expect(canAddTraveler(0, 2)).toBe(true);
      expect(canAddTraveler(1, 2)).toBe(true);
    });

    it('rejects once every seat has a traveler', () => {
      expect(canAddTraveler(2, 2)).toBe(false);
    });
  });

  describe('hasExactlyOneTourLead', () => {
    it('is false with zero tour leads', () => {
      expect(hasExactlyOneTourLead([{ isTourLead: false }, { isTourLead: false }])).toBe(false);
    });

    it('is true with exactly one', () => {
      expect(hasExactlyOneTourLead([{ isTourLead: true }, { isTourLead: false }])).toBe(true);
    });

    it('is false with more than one (should never happen, defensive)', () => {
      expect(hasExactlyOneTourLead([{ isTourLead: true }, { isTourLead: true }])).toBe(false);
    });
  });

  describe('isTravelerManifestComplete', () => {
    const lead = { isTourLead: true, passportDocumentId: 'doc-1' };
    const companion = { isTourLead: false, passportDocumentId: null };

    it('is false if fewer travelers than seats, regardless of whether passports are required', () => {
      expect(isTravelerManifestComplete([lead], 2, false)).toBe(false);
      expect(isTravelerManifestComplete([lead], 2, true)).toBe(false);
    });

    it('is false if no traveler is the tour lead', () => {
      expect(isTravelerManifestComplete([companion, { ...companion }], 2, false)).toBe(false);
    });

    it('is true once seats are filled and exactly one tour lead exists, when passports are not required', () => {
      // Neither traveler has a passport on file, but requiresPassports=false
      // (no Visa Assistance add-on) means that's fine.
      expect(isTravelerManifestComplete([lead, companion], 2, false)).toBe(true);
    });

    it('is false if the tour lead has no passport yet, when passports are required', () => {
      expect(
        isTravelerManifestComplete([{ ...lead, passportDocumentId: null }, { ...companion, passportDocumentId: 'doc-2' }], 2, true),
      ).toBe(false);
    });

    it('is false if a non-lead traveler has no passport yet, when passports are required (everyone needs one, not just the lead)', () => {
      expect(isTravelerManifestComplete([lead, companion], 2, true)).toBe(false);
    });

    it('is true once every traveler has a passport on file, when passports are required', () => {
      expect(isTravelerManifestComplete([lead, { ...companion, passportDocumentId: 'doc-2' }], 2, true)).toBe(true);
    });
  });

  describe('generateBookingReference', () => {
    const LETTER = /[A-Z]/;
    const DIGIT = /[0-9]/;
    const SAMPLE_SIZE = 200;

    it('is 6 characters of only uppercase letters and digits', () => {
      const code = generateBookingReference();
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^[A-Z0-9]{6}$/);
    });

    it('never repeats a character within a single code', () => {
      for (let i = 0; i < SAMPLE_SIZE; i++) {
        const code = generateBookingReference();
        expect(new Set(code.split('')).size).toBe(code.length);
      }
    });

    it('has exactly 2 or 3 letters, the rest digits', () => {
      for (let i = 0; i < SAMPLE_SIZE; i++) {
        const chars = generateBookingReference().split('');
        const letterCount = chars.filter((c) => LETTER.test(c)).length;
        expect([2, 3]).toContain(letterCount);
        expect(chars.filter((c) => DIGIT.test(c)).length).toBe(6 - letterCount);
      }
    });

    it('never places two letters adjacent to each other', () => {
      for (let i = 0; i < SAMPLE_SIZE; i++) {
        const chars = generateBookingReference().split('');
        for (let pos = 0; pos < chars.length - 1; pos++) {
          if (LETTER.test(chars[pos] ?? '')) expect(LETTER.test(chars[pos + 1] ?? '')).toBe(false);
        }
      }
    });

    it('is not the same every call', () => {
      const codes = new Set(Array.from({ length: 20 }, () => generateBookingReference()));
      expect(codes.size).toBeGreaterThan(1);
    });
  });

  // DR-046: preferredTags/preferredSites are the merged "plan my trip"
  // form's carried-over preference questions, staff context only (no more
  // package-matching/scoring, which is why this test lives here now instead
  // of a catalog QuizAnswers/scorePackagesForQuiz test that no longer exists).
  describe('CreateTailorMadeInput', () => {
    const base = {
      countries: ['NA'],
      customTravelStart: '2027-01-10',
      customTravelEnd: '2027-01-15',
      seats: 2,
      customDescription: 'A private Etosha + Sossusvlei combo, 6 days.',
      email: 'guest@example.test',
    };

    it('accepts preferredTags/preferredSites as optional arrays', () => {
      const result = CreateTailorMadeInput.safeParse({
        ...base,
        preferredTags: ['WILDLIFE', 'ADVENTURE'],
        preferredSites: ['Etosha National Park', 'Sossusvlei'],
      });
      expect(result.success).toBe(true);
    });

    it('accepts the input with neither preference field set', () => {
      expect(CreateTailorMadeInput.safeParse(base).success).toBe(true);
    });

    it('rejects a preferredTags value outside the known PackageTag vocabulary', () => {
      const result = CreateTailorMadeInput.safeParse({ ...base, preferredTags: ['NOT_A_REAL_TAG'] });
      expect(result.success).toBe(false);
    });

    // DR-047: multi-country selection + required contact email.
    it('accepts more than one country', () => {
      const result = CreateTailorMadeInput.safeParse({ ...base, countries: ['NA', 'ZM', 'ZW'] });
      expect(result.success).toBe(true);
    });

    it('rejects an empty countries array', () => {
      const result = CreateTailorMadeInput.safeParse({ ...base, countries: [] });
      expect(result.success).toBe(false);
    });

    it('rejects a missing email', () => {
      const { email: _email, ...withoutEmail } = base;
      const result = CreateTailorMadeInput.safeParse(withoutEmail);
      expect(result.success).toBe(false);
    });

    it('rejects a malformed email', () => {
      const result = CreateTailorMadeInput.safeParse({ ...base, email: 'not-an-email' });
      expect(result.success).toBe(false);
    });

    // DR-048: description is now optional; add-ons + residence/citizenship
    // are new optional staff-context fields.
    it('accepts the input with no customDescription at all', () => {
      const { customDescription: _customDescription, ...withoutDescription } = base;
      expect(CreateTailorMadeInput.safeParse(withoutDescription).success).toBe(true);
    });

    it('accepts preferredAddons/countryOfResidence/citizenship as optional', () => {
      const result = CreateTailorMadeInput.safeParse({
        ...base,
        preferredAddons: ['PHOTOGRAPHY', 'VISA_ASSISTANCE'],
        countryOfResidence: 'US',
        citizenship: 'GB',
      });
      expect(result.success).toBe(true);
    });

    it('rejects a preferredAddons value outside the known AddonCode vocabulary', () => {
      const result = CreateTailorMadeInput.safeParse({ ...base, preferredAddons: ['NOT_A_REAL_ADDON'] });
      expect(result.success).toBe(false);
    });
  });

  describe('lastNameMatches', () => {
    it('matches case-insensitively', () => {
      expect(lastNameMatches({ lastName: 'Traveler' }, 'traveler')).toBe(true);
      expect(lastNameMatches({ lastName: 'Traveler' }, 'TRAVELER')).toBe(true);
    });

    it('ignores surrounding whitespace', () => {
      expect(lastNameMatches({ lastName: 'Traveler' }, '  Traveler  ')).toBe(true);
    });

    it('is false for a different name', () => {
      expect(lastNameMatches({ lastName: 'Traveler' }, 'Someone Else')).toBe(false);
    });
  });

  describe('toTravelerDutyView (Guides Module, DR-030)', () => {
    const traveler: TravelerView = {
      id: 't1',
      organizationId: 'org1',
      bookingId: 'b1',
      firstName: 'Jane',
      lastName: 'Doe',
      age: 30,
      sex: 'F',
      nationality: 'US',
      idOrPassportNumber: 'P123456789',
      phone: '+15551234567',
      countryOfResidence: 'US',
      email: 'jane@example.test',
      disabilities: null,
      allergies: 'peanuts',
      drinkPreference: null,
      emergencyContactName: 'John Doe',
      emergencyContactPhone: '+15559876543',
      emergencyContactRelation: 'Spouse',
      isTourLead: true,
      passportDocumentId: 'doc1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('excludes idOrPassportNumber and passportDocumentId -- a guide never needs either', () => {
      const view = toTravelerDutyView(traveler);
      expect(view).not.toHaveProperty('idOrPassportNumber');
      expect(view).not.toHaveProperty('passportDocumentId');
      expect(view).not.toHaveProperty('organizationId');
      expect(view).not.toHaveProperty('bookingId');
    });

    it('keeps every duty-relevant field', () => {
      const view = toTravelerDutyView(traveler);
      expect(view).toEqual({
        id: 't1',
        firstName: 'Jane',
        lastName: 'Doe',
        age: 30,
        sex: 'F',
        nationality: 'US',
        phone: '+15551234567',
        disabilities: null,
        allergies: 'peanuts',
        drinkPreference: null,
        emergencyContactName: 'John Doe',
        emergencyContactPhone: '+15559876543',
        emergencyContactRelation: 'Spouse',
        isTourLead: true,
      });
    });
  });
});

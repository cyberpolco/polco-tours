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
  generateConfirmationCode,
  formatBookingReference,
  lastNameMatches,
  toTravelerDutyView,
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

    it('is false if fewer travelers than seats', () => {
      expect(isTravelerManifestComplete([lead], 2)).toBe(false);
    });

    it('is false if no traveler is the tour lead', () => {
      expect(isTravelerManifestComplete([companion, { ...companion }], 2)).toBe(false);
    });

    it('is false if the tour lead has no passport yet', () => {
      expect(isTravelerManifestComplete([{ ...lead, passportDocumentId: null }, companion], 2)).toBe(false);
    });

    it('is true once seats are filled, exactly one tour lead, passport on file', () => {
      expect(isTravelerManifestComplete([lead, companion], 2)).toBe(true);
    });
  });

  describe('generateConfirmationCode', () => {
    it('is 8 characters from the unambiguous alphabet (no 0/O/1/I)', () => {
      const code = generateConfirmationCode();
      expect(code).toHaveLength(8);
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    });

    it('is not the same every call', () => {
      const codes = new Set(Array.from({ length: 20 }, () => generateConfirmationCode()));
      expect(codes.size).toBeGreaterThan(1);
    });
  });

  describe('formatBookingReference', () => {
    it('formats as POL-{year}-{6-digit zero-padded sequence}', () => {
      expect(formatBookingReference(2026, 154)).toBe('POL-2026-000154');
    });

    it('does not truncate a sequence longer than 6 digits', () => {
      expect(formatBookingReference(2026, 1234567)).toBe('POL-2026-1234567');
    });

    it('accepts a bigint sequence (Postgres nextval())', () => {
      expect(formatBookingReference(2026, 42n)).toBe('POL-2026-000042');
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

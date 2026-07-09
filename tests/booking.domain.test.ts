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

    it('is false for a non-HELD booking regardless of holdExpiresAt', () => {
      expect(isHoldExpired({ status: 'CONFIRMED', holdExpiresAt: new Date('2026-01-01T00:00:00Z') }, now)).toBe(
        false,
      );
    });

    it('is false for a HELD booking with no expiry set', () => {
      expect(isHoldExpired({ status: 'HELD', holdExpiresAt: null }, now)).toBe(false);
    });

    it('is true once the hold window has passed', () => {
      expect(isHoldExpired({ status: 'HELD', holdExpiresAt: new Date('2026-01-01T00:29:59Z') }, now)).toBe(true);
    });

    it('is false right up to the expiry instant, true at it', () => {
      expect(isHoldExpired({ status: 'HELD', holdExpiresAt: new Date('2026-01-01T00:30:01Z') }, now)).toBe(false);
      expect(isHoldExpired({ status: 'HELD', holdExpiresAt: now }, now)).toBe(true);
    });
  });

  describe('occupiesCapacity', () => {
    const now = new Date('2026-01-01T00:30:00Z');

    it('a CONFIRMED booking always occupies a seat', () => {
      expect(occupiesCapacity({ status: 'CONFIRMED', holdExpiresAt: null }, now)).toBe(true);
    });

    it('a non-expired HELD booking occupies a seat', () => {
      expect(occupiesCapacity({ status: 'HELD', holdExpiresAt: new Date('2026-01-01T01:00:00Z') }, now)).toBe(true);
    });

    it('an expired HELD booking does not occupy a seat', () => {
      expect(occupiesCapacity({ status: 'HELD', holdExpiresAt: new Date('2026-01-01T00:00:00Z') }, now)).toBe(false);
    });

    it('CANCELLED and EXPIRED never occupy a seat', () => {
      expect(occupiesCapacity({ status: 'CANCELLED', holdExpiresAt: null }, now)).toBe(false);
      expect(occupiesCapacity({ status: 'EXPIRED', holdExpiresAt: null }, now)).toBe(false);
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
    it('a HELD booking can move to CONFIRMED, CANCELLED, or EXPIRED', () => {
      expect(canTransition('HELD', 'CONFIRMED')).toBe(true);
      expect(canTransition('HELD', 'CANCELLED')).toBe(true);
      expect(canTransition('HELD', 'EXPIRED')).toBe(true);
    });

    it('a CONFIRMED booking can only move to CANCELLED', () => {
      expect(canTransition('CONFIRMED', 'CANCELLED')).toBe(true);
      expect(canTransition('CONFIRMED', 'HELD')).toBe(false);
      expect(canTransition('CONFIRMED', 'EXPIRED')).toBe(false);
    });

    it('CANCELLED and EXPIRED are terminal', () => {
      expect(canTransition('CANCELLED', 'CONFIRMED')).toBe(false);
      expect(canTransition('CANCELLED', 'HELD')).toBe(false);
      expect(canTransition('EXPIRED', 'CONFIRMED')).toBe(false);
      expect(canTransition('EXPIRED', 'HELD')).toBe(false);
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
});

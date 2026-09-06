import { describe, it, expect, beforeAll } from 'vitest';
import { createBookingSetupToken, readBookingSetupToken, BOOKING_SETUP_TTL_SECONDS } from '../src/lib/booking-setup-token';

/**
 * DR-257. This token is the one bearer credential on the guest site, so its
 * failure modes matter more than its happy path: a forgeable or
 * non-expiring token would hand over a stranger's booking setup.
 */
beforeAll(() => {
  process.env.BETTER_AUTH_SECRET ??= 'test-secret-for-booking-setup-token';
});

const BOOKING_ID = '0f9d5a2e-1c3b-4c7a-9d6e-2b8f4a1c7e50';

describe('booking setup token', () => {
  it('round-trips the booking id it was issued for', () => {
    const token = createBookingSetupToken(BOOKING_ID);
    expect(readBookingSetupToken(token)).toBe(BOOKING_ID);
  });

  it('rejects a token whose booking id was swapped (signature no longer matches)', () => {
    const token = createBookingSetupToken(BOOKING_ID);
    const [, expiresAt, signature] = token.split('.');
    const forged = `some-other-booking-id.${expiresAt}.${signature}`;
    expect(readBookingSetupToken(forged)).toBeNull();
  });

  it('rejects a token whose expiry was pushed out by hand', () => {
    const token = createBookingSetupToken(BOOKING_ID);
    const [bookingId, , signature] = token.split('.');
    const farFuture = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
    expect(readBookingSetupToken(`${bookingId}.${farFuture}.${signature}`)).toBeNull();
  });

  it('rejects a tampered signature', () => {
    const token = createBookingSetupToken(BOOKING_ID);
    const [bookingId, expiresAt, signature] = token.split('.');
    const flipped = `${signature!.slice(0, -1)}${signature!.endsWith('A') ? 'B' : 'A'}`;
    expect(readBookingSetupToken(`${bookingId}.${expiresAt}.${flipped}`)).toBeNull();
  });

  it('rejects a signature of a different length without throwing', () => {
    const token = createBookingSetupToken(BOOKING_ID);
    const [bookingId, expiresAt] = token.split('.');
    expect(() => readBookingSetupToken(`${bookingId}.${expiresAt}.short`)).not.toThrow();
    expect(readBookingSetupToken(`${bookingId}.${expiresAt}.short`)).toBeNull();
  });

  it('expires', () => {
    const issuedAt = new Date('2026-01-01T00:00:00Z');
    const token = createBookingSetupToken(BOOKING_ID, issuedAt);

    const justBefore = new Date(issuedAt.getTime() + (BOOKING_SETUP_TTL_SECONDS - 5) * 1000);
    expect(readBookingSetupToken(token, justBefore)).toBe(BOOKING_ID);

    const justAfter = new Date(issuedAt.getTime() + (BOOKING_SETUP_TTL_SECONDS + 5) * 1000);
    expect(readBookingSetupToken(token, justAfter)).toBeNull();
  });

  it('treats missing and malformed tokens as simply not verified', () => {
    expect(readBookingSetupToken(undefined)).toBeNull();
    expect(readBookingSetupToken('')).toBeNull();
    expect(readBookingSetupToken('not-a-token')).toBeNull();
    expect(readBookingSetupToken('two.parts')).toBeNull();
    expect(readBookingSetupToken('a.b.c.d')).toBeNull();
    expect(readBookingSetupToken('..')).toBeNull();
  });

  it('does not accept a token signed with a different secret', () => {
    const original = process.env.BETTER_AUTH_SECRET;
    const token = createBookingSetupToken(BOOKING_ID);
    process.env.BETTER_AUTH_SECRET = 'a-completely-different-secret';
    try {
      expect(readBookingSetupToken(token)).toBeNull();
    } finally {
      process.env.BETTER_AUTH_SECRET = original;
    }
  });
});

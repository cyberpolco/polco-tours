import { createHmac, timingSafeEqual } from 'crypto';

// DR-257: the credential that carries a guest through the multi-step
// /complete-booking flow after one full three-factor check
// (bookingReference + tour-lead last name + on-file email).
//
// Why this exists at all: the rest of this app's no-account guest paths are
// pure knowledge-factor lookups, never bearer tokens -- but a five-step
// wizard cannot re-ask for all three factors on every submit, and putting
// the email in a query string would leak it through history/referrer the way
// /api/v1/find-booking/invoice-pdf already leaks the reference + last name.
//
// So this is deliberately the narrowest possible credential: ONE booking id,
// no user identity, no session, 60 minutes, and it authorises only the
// /complete-booking setup writes. It does NOT authorise
// bookingService.cancelForBookingLookup, which keeps demanding all three
// factors on every call precisely because it is destructive.
//
// `crypto` is imported bare rather than as `node:crypto` -- see the CLAUDE.md
// gotcha on `node:`-prefixed builtins hard-failing a client bundle through a
// module barrel (DR-229/230/232). Nothing here may be imported by a
// 'use client' file.

export const BOOKING_SETUP_COOKIE = 'booking_setup';

/** Short enough that a shared/abandoned browser stops being a way in, long
 * enough to fill in a traveller manifest without being kicked out. */
export const BOOKING_SETUP_TTL_SECONDS = 60 * 60;

function secret(): string {
  const value = process.env.BETTER_AUTH_SECRET;
  // Fail loudly rather than silently signing with a blank key -- an
  // unsigned-in-effect token would make this cookie forgeable.
  if (!value) throw new Error('BETTER_AUTH_SECRET is required to sign the booking setup token');
  return value;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

/** `<bookingId>.<expiryEpochSeconds>.<hmac>` -- opaque to the browser, and
 * self-describing enough that verification needs no server-side storage. */
export function createBookingSetupToken(bookingId: string, now: Date = new Date()): string {
  const expiresAt = Math.floor(now.getTime() / 1000) + BOOKING_SETUP_TTL_SECONDS;
  const payload = `${bookingId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

/** Returns the booking id the token names, or null if it is malformed,
 * tampered with, or expired. Never throws on bad input -- a caller treats
 * null as "not verified" and sends the guest back to the verify step. */
export function readBookingSetupToken(token: string | undefined, now: Date = new Date()): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [bookingId, expiresAtRaw, signature] = parts as [string, string, string];
  if (!bookingId || !expiresAtRaw || !signature) return null;

  const expected = sign(`${bookingId}.${expiresAtRaw}`);
  // Constant-time: a length-safe compare, since timingSafeEqual throws on
  // mismatched lengths rather than returning false.
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 <= now.getTime()) return null;

  return bookingId;
}

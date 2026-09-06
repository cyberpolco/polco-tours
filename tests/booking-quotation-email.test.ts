import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Reported production bug: the quotation email never reached the guest.
 *
 * bookingService.sendQuotation notified via notify(), which resolves EMAIL
 * from the recipient's `User.email` -- but a guest checkout has no real
 * account. better-auth's anonymous plugin fills that column with an
 * undeliverable `temp@<random>.com` placeholder (confirmed against
 * production: every TAILOR_MADE booking made by a real guest has one), so
 * the mail was addressed to a domain that does not exist.
 *
 * This is the third time this exact bug has shipped -- DR-215 fixed it for
 * PAYMENT_SUCCEEDED and DR-223 for the visa decision events -- hence a
 * regression test rather than just the fix. The guard that matters is
 * "never send a guest email to the temp@ placeholder when a real address is
 * on the booking", so that is what these assert.
 */

const { findById, sendQuotation, updateStatus, listTravelersForBooking } = vi.hoisted(() => ({
  findById: vi.fn(),
  sendQuotation: vi.fn(),
  updateStatus: vi.fn(),
  listTravelersForBooking: vi.fn(),
}));
vi.mock('../src/modules/booking/repository', () => ({
  bookingRepository: { findById, sendQuotation, updateStatus, listTravelersForBooking },
  InvalidTransitionError: class InvalidTransitionError extends Error {},
}));

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock('@modules/auth', () => ({ authService: { getUser } }));

const { notify, notifyEmail } = vi.hoisted(() => ({ notify: vi.fn(), notifyEmail: vi.fn() }));
vi.mock('@modules/notifications', () => ({ notificationsService: { notify, notifyEmail } }));

const { audit } = vi.hoisted(() => ({ audit: vi.fn() }));
vi.mock('@lib/audit', () => ({ audit }));

vi.mock('@lib/rbac', () => ({ assertCan: vi.fn(), can: vi.fn(() => true) }));

import type { AuthContext } from '@modules/auth';
import { bookingService } from '../src/modules/booking/service';

const ORG = 'org-1';
const ANON_PLACEHOLDER = 'temp@uhjqu11uap3izad6dbfyahhudvydih5f.com';
const GUEST_TYPED_EMAIL = 'real.guest@example.test';
const TOUR_LEAD_EMAIL = 'tour.lead@example.test';

/** vitest types mock.calls as possibly-empty under noUncheckedIndexedAccess;
 * assert the call happened once and hand back a definitely-present tuple. */
function firstCall(mock: { mock: { calls: unknown[][] } }): unknown[] {
  const call = mock.mock.calls[0];
  expect(call).toBeDefined();
  return call as unknown[];
}

const ctx: AuthContext = {
  userId: 'staff-1',
  roles: ['TOUR_OPERATOR'],
  permissions: new Set(['booking.confirm', 'booking.create']),
  organizationId: ORG,
  sessionId: 'session-fixture',
  mustChangePassword: false,
};

function bookingFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-1',
    bookingReference: 'ABC123',
    organizationId: ORG,
    touristUserId: 'anon-user-1',
    origin: 'TAILOR_MADE',
    status: 'QUOTATION_SENT',
    contactEmail: GUEST_TYPED_EMAIL,
    priceMinor: 250000,
    currency: 'USD',
    seats: 2,
    departureId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ id: 'anon-user-1', email: ANON_PLACEHOLDER, preferredLocale: 'EN', phone: null });
  listTravelersForBooking.mockResolvedValue([]);
  notify.mockResolvedValue(undefined);
  notifyEmail.mockResolvedValue(undefined);
  audit.mockResolvedValue(undefined);
});

describe('bookingService.sendQuotation -- guest email delivery', () => {
  it('emails the address the guest typed, not the anonymous temp@ placeholder', async () => {
    const booking = bookingFixture();
    findById.mockResolvedValue(booking);
    sendQuotation.mockResolvedValue(booking);

    await bookingService.sendQuotation(ctx, 'booking-1', { priceMinor: 250000, currency: 'USD' });

    expect(notifyEmail).toHaveBeenCalledTimes(1);
    const [event, to, locale, organizationId, data] = firstCall(notifyEmail);
    expect(event).toBe('QUOTATION_SENT');
    expect(to).toBe(GUEST_TYPED_EMAIL);
    expect(to).not.toContain('temp@');
    expect(locale).toBe('EN');
    expect(organizationId).toBe(ORG);
    expect(data).toMatchObject({ bookingId: 'ABC123', amountMinor: 250000, currency: 'USD' });

    // notify() is the broken path -- it would address the placeholder.
    expect(notify).not.toHaveBeenCalled();
  });

  it("prefers the tour lead's own email over the booking-level contact email", async () => {
    const booking = bookingFixture();
    findById.mockResolvedValue(booking);
    sendQuotation.mockResolvedValue(booking);
    listTravelersForBooking.mockResolvedValue([
      { id: 't2', isTourLead: false, email: 'someone.else@example.test' },
      { id: 't1', isTourLead: true, email: TOUR_LEAD_EMAIL },
    ]);

    await bookingService.sendQuotation(ctx, 'booking-1', { priceMinor: 250000, currency: 'USD' });

    expect(firstCall(notifyEmail)[1]).toBe(TOUR_LEAD_EMAIL);
  });

  it('falls back to the notify() chain only when no real address exists at all', async () => {
    const booking = bookingFixture({ contactEmail: null });
    findById.mockResolvedValue(booking);
    sendQuotation.mockResolvedValue(booking);
    getUser.mockResolvedValue({ id: 'anon-user-1', email: null, preferredLocale: 'EN', phone: null });

    await bookingService.sendQuotation(ctx, 'booking-1', { priceMinor: 250000, currency: 'USD' });

    expect(notifyEmail).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(firstCall(notify)[0]).toBe('QUOTATION_SENT');
  });

  it('uses the FR template when the guest browsed in French', async () => {
    const booking = bookingFixture();
    findById.mockResolvedValue(booking);
    sendQuotation.mockResolvedValue(booking);
    getUser.mockResolvedValue({ id: 'anon-user-1', email: ANON_PLACEHOLDER, preferredLocale: 'FR', phone: null });

    await bookingService.sendQuotation(ctx, 'booking-1', { priceMinor: 250000, currency: 'USD' });

    expect(firstCall(notifyEmail)[2]).toBe('FR');
  });
});

describe('bookingService.acceptQuotation -- guest email delivery', () => {
  it('emails the real address rather than the placeholder', async () => {
    const booking = bookingFixture({ status: 'AWAITING_DEPOSIT' });
    findById.mockResolvedValue(booking);
    updateStatus.mockResolvedValue(booking);

    await bookingService.acceptQuotation(ctx, 'booking-1');

    expect(notifyEmail).toHaveBeenCalledTimes(1);
    expect(firstCall(notifyEmail)[0]).toBe('QUOTATION_ACCEPTED');
    expect(firstCall(notifyEmail)[1]).toBe(GUEST_TYPED_EMAIL);
    expect(notify).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// DR-259: sendBookingConfirmedNotice composes booking/catalog/invoicing/
// notifications directly (booking must never depend on invoicing, would be
// circular -- see CLAUDE.md's "Module dependency direction matters"), so
// this test mocks all four at the module boundary rather than hitting a
// real DB, same convention as fleet-availability's own tests.
const { resolveGuestContactForBooking, listTravelers } = vi.hoisted(() => ({
  resolveGuestContactForBooking: vi.fn(),
  listTravelers: vi.fn(),
}));
vi.mock('@modules/booking', () => ({
  bookingService: { resolveGuestContactForBooking, listTravelers },
}));

const { getDepartureTripSummaryForBookingLookup } = vi.hoisted(() => ({
  getDepartureTripSummaryForBookingLookup: vi.fn(),
}));
vi.mock('@modules/catalog', () => ({
  catalogService: { getDepartureTripSummaryForBookingLookup },
}));

const { getInvoicePdfAttachmentForBooking } = vi.hoisted(() => ({
  getInvoicePdfAttachmentForBooking: vi.fn(),
}));
vi.mock('@modules/invoicing', () => ({
  invoicingService: { getInvoicePdfAttachmentForBooking },
}));

const { notifyEmailAndWhatsApp, notify } = vi.hoisted(() => ({
  notifyEmailAndWhatsApp: vi.fn(),
  notify: vi.fn(),
}));
vi.mock('@modules/notifications', () => ({
  notificationsService: { notifyEmailAndWhatsApp, notify },
}));

import { sendBookingConfirmedNotice } from '../src/lib/booking-confirmed-notice';
import type { AuthContext } from '@modules/auth';
import type { BookingView } from '@modules/booking';

const ctx = { userId: 'staff1', roles: ['TOUR_OPERATOR'], organizationId: 'org1', permissions: [] } as unknown as AuthContext;

function makeBooking(overrides: Partial<BookingView> = {}): BookingView {
  return {
    id: 'bk_id_1',
    bookingReference: 'BK-4242',
    touristUserId: 'tourist1',
    departureId: 'dep1',
    seats: 4,
    customCountry: null,
    customTravelStart: null,
    customTravelEnd: null,
    ...overrides,
  } as BookingView;
}

describe('sendBookingConfirmedNotice (DR-259)', () => {
  beforeEach(() => {
    resolveGuestContactForBooking.mockReset();
    listTravelers.mockReset().mockResolvedValue([]);
    getDepartureTripSummaryForBookingLookup.mockReset();
    getInvoicePdfAttachmentForBooking.mockReset().mockResolvedValue([]);
    notifyEmailAndWhatsApp.mockReset().mockResolvedValue(undefined);
    notify.mockReset().mockResolvedValue(undefined);
  });

  it('sends the trip/dates/travelers detail plus the invoice PDF over both email and WhatsApp when contact info exists', async () => {
    resolveGuestContactForBooking.mockResolvedValue({ email: 'lead@example.test', phone: '+15551234567', locale: 'EN' });
    getDepartureTripSummaryForBookingLookup.mockResolvedValue({
      title: 'The Nomad Loop',
      country: 'Namibia',
      startDate: new Date('2027-03-10T00:00:00Z'),
      endDate: new Date('2027-03-20T00:00:00Z'),
    });
    const attachments = [{ filename: 'BK-4242-receipt-en.pdf', content: Buffer.from('%PDF') }];
    getInvoicePdfAttachmentForBooking.mockResolvedValue(attachments);

    await sendBookingConfirmedNotice(ctx, 'org1', makeBooking());

    expect(getInvoicePdfAttachmentForBooking).toHaveBeenCalledWith('org1', 'bk_id_1', 'BK-4242', [], 'EN');
    expect(notifyEmailAndWhatsApp).toHaveBeenCalledTimes(1);
    const [event, recipient, locale, organizationId, data, sentAttachments] = notifyEmailAndWhatsApp.mock.calls[0]!;
    expect(event).toBe('BOOKING_CONFIRMED');
    expect(recipient).toEqual({ email: 'lead@example.test', phone: '+15551234567', locale: 'EN' });
    expect(locale).toBe('EN');
    expect(organizationId).toBe('org1');
    expect(data).toMatchObject({
      bookingId: 'BK-4242',
      seats: 4,
      tripTitle: 'The Nomad Loop',
      tripCountry: 'Namibia',
    });
    expect(sentAttachments).toBe(attachments);
    expect(notify).not.toHaveBeenCalled();
  });

  it('falls back to a generic custom-trip country for a TAILOR_MADE booking with no Departure', async () => {
    resolveGuestContactForBooking.mockResolvedValue({ email: 'lead@example.test', phone: null, locale: 'FR' });

    await sendBookingConfirmedNotice(
      ctx,
      'org1',
      makeBooking({ departureId: null, customCountry: 'Zambia', customTravelStart: new Date('2027-05-01'), customTravelEnd: new Date('2027-05-10') }),
    );

    expect(getDepartureTripSummaryForBookingLookup).not.toHaveBeenCalled();
    const data = notifyEmailAndWhatsApp.mock.calls[0]?.[4];
    expect(data).toMatchObject({ tripCountry: 'Zambia' });
  });

  it('falls back to notify() when neither an email nor a phone resolves', async () => {
    resolveGuestContactForBooking.mockResolvedValue({ email: null, phone: null, locale: 'EN' });

    await sendBookingConfirmedNotice(ctx, 'org1', makeBooking());

    expect(notifyEmailAndWhatsApp).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('BOOKING_CONFIRMED', 'tourist1', 'org1', expect.objectContaining({ bookingId: 'BK-4242' }));
  });

  it('never throws when a dependency fails (charter rule 8)', async () => {
    resolveGuestContactForBooking.mockRejectedValue(new Error('db down'));

    await expect(sendBookingConfirmedNotice(ctx, 'org1', makeBooking())).resolves.toBeUndefined();
    expect(notifyEmailAndWhatsApp).not.toHaveBeenCalled();
  });
});

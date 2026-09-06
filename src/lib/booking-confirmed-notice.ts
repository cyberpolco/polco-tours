// Cross-module orchestration (DR-259): the BOOKING_CONFIRMED notice needs
// booking's own trip/traveler data, catalog's departure trip summary, AND
// invoicing's invoice/receipt PDF -- invoicing is a separate module, and
// booking must never depend on it (would be circular: invoicing already
// depends on booking, see CLAUDE.md's "Module dependency direction
// matters"). Lives one level up in src/lib instead, same precedent as
// fleet-availability.ts composing assignment/booking/catalog/fleet directly.
//
// Explicit user request: a BOOKING_CONFIRMED notice must always be
// attempted over BOTH email and WhatsApp (not notify()'s single fallback
// chain, and not the plain notifyGuest email-only-unless-no-email shape
// bookingService.confirm() used before this DR), carrying a full
// trip/dates/travelers detail block (mirrors invoicing's own
// notifyPaymentSucceeded trip-summary derivation) and the invoice/receipt
// PDF attached on whichever channel(s) can carry it -- as a WhatsApp
// document message when a phone resolves, and via notifyEmail's existing
// attachment shape when an email resolves. Call this from the route/Server
// Action layer right after bookingService.confirm() succeeds, in place of
// (not in addition to) the notifyGuest('BOOKING_CONFIRMED', ...) call that
// used to live inside bookingService.confirm() itself -- see that call
// site's own removal note. Never throws (charter rule 8): a failure here
// must never fail the confirm action that triggered it, same discipline as
// syncFleetAvailabilityForDeparture.
import type { AuthContext } from '@modules/auth';
import { bookingService, type BookingView } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { invoicingService } from '@modules/invoicing';
import { notificationsService } from '@modules/notifications';
import { logger, newTraceId } from '@lib/logger';

export async function sendBookingConfirmedNotice(ctx: AuthContext, organizationId: string, booking: BookingView): Promise<void> {
  const log = logger(newTraceId());
  try {
    const [contact, travelers] = await Promise.all([
      bookingService.resolveGuestContactForBooking(organizationId, booking),
      bookingService.listTravelers(ctx, booking.id),
    ]);

    const tripSummary = booking.departureId
      ? await catalogService.getDepartureTripSummaryForBookingLookup(organizationId, booking.departureId)
      : null;
    const data = {
      bookingId: booking.bookingReference,
      seats: booking.seats,
      tripTitle: tripSummary?.title,
      tripCountry: tripSummary?.country ?? booking.customCountry ?? undefined,
      travelStart: tripSummary?.startDate ?? booking.customTravelStart ?? undefined,
      travelEnd: tripSummary?.endDate ?? booking.customTravelEnd ?? undefined,
    };

    const attachments = await invoicingService.getInvoicePdfAttachmentForBooking(
      organizationId,
      booking.id,
      booking.bookingReference,
      travelers,
      contact.locale,
    );

    if (contact.email || contact.phone) {
      await notificationsService.notifyEmailAndWhatsApp('BOOKING_CONFIRMED', contact, contact.locale, organizationId, data, attachments);
      return;
    }

    // Extremely rare (no traveler manifest, no booking-level contact email,
    // no user contact at all) -- fall back to the old fallback chain rather
    // than silently dropping the notice, same precedent as invoicing's own
    // notifyPaymentSucceeded/notifyGuest.
    await notificationsService.notify('BOOKING_CONFIRMED', booking.touristUserId, organizationId, data);
  } catch (err) {
    log.error('sendBookingConfirmedNotice failed', {
      bookingId: booking.id,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

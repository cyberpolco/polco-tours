'use server';

import type { PaymentKind } from '@prisma/client';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireStaffContext } from '@lib/staff-guard';
import { bookingService } from '@modules/booking';
import { invoicingService } from '@modules/invoicing';
import { itineraryService } from '@modules/itinerary';
import { ratingsService } from '@modules/ratings';

export async function confirmBookingAction(bookingId: string) {
  const ctx = await requireStaffContext('booking.confirm');
  await bookingService.confirm(ctx, bookingId);
  revalidatePath(`/staff/bookings/${bookingId}`);
}

export async function cancelBookingAction(bookingId: string) {
  const ctx = await requireStaffContext('booking.cancel');
  await bookingService.cancel(ctx, bookingId);
  revalidatePath(`/staff/bookings/${bookingId}`);
}

export async function initiatePaymentAction(invoiceId: string, kind: PaymentKind, bookingId: string) {
  const ctx = await requireStaffContext('payment.initiate');
  await invoicingService.initiatePayment(ctx, invoiceId, kind);
  revalidatePath(`/staff/bookings/${bookingId}`);
}

export async function resolvePaymentAction(paymentId: string, outcome: 'SUCCEEDED' | 'FAILED', bookingId: string) {
  const ctx = await requireStaffContext('payment.resolve');
  await invoicingService.resolvePayment(ctx, paymentId, outcome);
  revalidatePath(`/staff/bookings/${bookingId}`);
}

// Lets staff accept a quotation on the client's behalf (e.g. a phone
// acceptance) -- previously QUOTATION_SENT -> AWAITING_DEPOSIT was only
// reachable from the guest booking page. Reuses the same
// bookingService.acceptQuotation the guest action calls; staff bypass the
// ownership check inside it (getOwnedBooking), so no service change needed.
export async function acceptQuotationAction(bookingId: string) {
  // booking.create, matching bookingService.acceptQuotation's own assertCan
  // (same permission covers "create a booking for a client" and "accept a
  // quotation for a client" -- both are acting on the tourist's behalf).
  const ctx = await requireStaffContext('booking.create');
  await bookingService.acceptQuotation(ctx, bookingId);
  revalidatePath(`/staff/bookings/${bookingId}`);
}

export async function sendQuotationAction(bookingId: string, formData: FormData) {
  const ctx = await requireStaffContext('booking.confirm');
  const amount = Number(formData.get('amount'));
  const currency = formData.get('currency');
  await bookingService.sendQuotation(ctx, bookingId, {
    // Staff enters a decimal amount (e.g. "1234.56"); every supported
    // currency (USD/EUR/NAD/CDF) uses 2 decimal places (@lib/money's
    // DECIMALS), so *100 is safe here.
    priceMinor: Math.round(amount * 100),
    currency: currency as 'USD' | 'EUR' | 'NAD' | 'CDF',
  });
  revalidatePath(`/staff/bookings/${bookingId}`);
}

export async function refundBookingAction(bookingId: string) {
  const ctx = await requireStaffContext('booking.confirm');
  await bookingService.refund(ctx, bookingId);
  revalidatePath(`/staff/bookings/${bookingId}`);
}

export async function convertToItineraryAction(bookingId: string) {
  const ctx = await requireStaffContext('booking.confirm');
  await bookingService.convertToItinerary(ctx, bookingId);
  revalidatePath(`/staff/bookings/${bookingId}`);
}

// Itinerary Management (DR-033) -- creates the new Itinerary record (day-by-
// day plan, hotels/restaurants, approval workflow), distinct from
// convertToItineraryAction above (which creates the underlying bespoke
// Departure for a TAILOR_MADE booking, the older DR-028 sense of the word).
export async function createItineraryAction(bookingId: string) {
  const ctx = await requireStaffContext('itinerary.write');
  const itinerary = await itineraryService.createItinerary(ctx, bookingId, {});
  redirect(`/staff/itineraries/${itinerary.id}`);
}

// Customer Ratings & Feedback (DR-037) -- gated on rating.issue (creates a
// row in the ratings module's own table), not booking.confirm, matching
// createItineraryAction's precedent above rather than this file's other
// Booking-mutating actions.
export async function issueRatingCodeAction(bookingId: string) {
  const ctx = await requireStaffContext('rating.issue');
  await ratingsService.issueRatingCode(ctx, bookingId);
  revalidatePath(`/staff/bookings/${bookingId}`);
}

// DR-058: genuinely destructive -- SUPERADMIN-only, enforced inside
// bookingService.deleteBooking (this route-level permission alone isn't the
// real gate). Redirects rather than revalidating, since the page this
// action runs from no longer exists once the booking is gone.
export async function deleteBookingAction(bookingId: string) {
  const ctx = await requireStaffContext('booking.delete');
  await bookingService.deleteBooking(ctx, bookingId);
  redirect('/staff/bookings');
}

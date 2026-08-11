'use server';

import type { PaymentKind } from '@prisma/client';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireStaffContext } from '@lib/staff-guard';
import { syncFleetAvailabilityForDeparture } from '@lib/fleet-availability';
import { ApiError } from '@lib/errors';
import { bookingService } from '@modules/booking';
import { invoicingService } from '@modules/invoicing';
import { itineraryService } from '@modules/itinerary';
import { ratingsService } from '@modules/ratings';
import type { CouponActionState } from '@/components/CouponForm';

export async function confirmBookingAction(bookingId: string) {
  const ctx = await requireStaffContext('booking.confirm');
  const booking = await bookingService.confirm(ctx, bookingId);
  // DR-082: a CONFIRMED booking marks its assigned vehicle/driver/guide
  // BOOKED -- orchestrated here (not inside bookingService.confirm), same
  // "cross-module side effect stays at the caller layer" convention as
  // deleteBookingAction's itinerary cleanup below.
  if (booking.departureId) await syncFleetAvailabilityForDeparture(booking.organizationId, booking.departureId);
  revalidatePath(`/staff/bookings/${bookingId}`);
}

export async function cancelBookingAction(bookingId: string) {
  const ctx = await requireStaffContext('booking.cancel');
  const booking = await bookingService.cancel(ctx, bookingId);
  if (booking.departureId) await syncFleetAvailabilityForDeparture(booking.organizationId, booking.departureId);
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

export async function applyCouponAction(
  invoiceId: string,
  bookingId: string,
  _prevState: CouponActionState,
  formData: FormData,
): Promise<CouponActionState> {
  const ctx = await requireStaffContext('payment.initiate');
  const code = String(formData.get('code') ?? '').trim();
  if (!code) return { error: 'Enter a coupon code' };
  try {
    await invoicingService.applyCoupon(ctx, invoiceId, code);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.detail ?? err.title };
    throw err;
  }
  revalidatePath(`/staff/bookings/${bookingId}`);
  return {};
}

export async function removeCouponAction(invoiceId: string, bookingId: string): Promise<void> {
  const ctx = await requireStaffContext('payment.initiate');
  await invoicingService.removeCoupon(ctx, invoiceId);
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
  const booking = await bookingService.refund(ctx, bookingId);
  if (booking.departureId) await syncFleetAvailabilityForDeparture(booking.organizationId, booking.departureId);
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
//
// DR-059 follow-up: also removes the booking's Itinerary, if it has one --
// orchestrated HERE, not inside bookingService.deleteBooking itself, since
// the itinerary module already depends on booking (module-boundary rule
// forbids the reverse). Itinerary first, then the booking: if the booking
// step fails afterward, the booking is still visible with its itinerary
// gone (recreatable); the other order would risk exactly the dangling-
// itinerary regression DR-059 already had to fix once.
export async function deleteBookingAction(bookingId: string) {
  const ctx = await requireStaffContext('booking.delete');
  await itineraryService.deleteForBooking(ctx, bookingId);
  await bookingService.deleteBooking(ctx, bookingId);
  redirect('/staff/bookings');
}

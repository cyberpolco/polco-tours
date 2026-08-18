'use server';

import type { PaymentKind } from '@prisma/client';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireStaffContext } from '@lib/staff-guard';
import { syncFleetAvailabilityForDeparture } from '@lib/fleet-availability';
import { createCustomizedPackageFromBooking } from '@lib/create-customized-package';
import { ApiError } from '@lib/errors';
import { bookingService } from '@modules/booking';
import { financeService } from '@modules/finance';
import { invoicingService } from '@modules/invoicing';
import { itineraryService } from '@modules/itinerary';
import { ratingsService } from '@modules/ratings';
import { visaService } from '@modules/visa';
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

// DR-128: requires a reason whenever the submitted price deviates from this
// booking's own cost breakdown (comparison lives here, not inside
// bookingService.sendQuotation -- finance depends on booking, so booking
// can't import financeService itself without a cycle; this Server Action is
// the "one level up" layer that can see both). Keeps a hand-typed quotation
// distinguishable and audited rather than silently indistinguishable from
// one computed straight out of Operational Rates.
export async function sendQuotationAction(bookingId: string, formData: FormData) {
  const ctx = await requireStaffContext('booking.confirm');
  const amount = Number(formData.get('amount'));
  const currency = formData.get('currency') as 'USD' | 'EUR' | 'NAD' | 'CDF';
  // Staff enters a decimal amount (e.g. "1234.56"); every supported currency
  // (USD/EUR/NAD/CDF) uses 2 decimal places (@lib/money's DECIMALS), so *100
  // is safe here.
  const priceMinor = Math.round(amount * 100);
  const overrideReason = String(formData.get('overrideReason') ?? '').trim() || undefined;

  const breakdown = await financeService.getBookingCostBreakdown(ctx, bookingId);
  const deviatesFromBreakdown =
    breakdown?.suggestedTotalMinor != null && (priceMinor !== breakdown.suggestedTotalMinor || currency !== breakdown.currency);
  if (deviatesFromBreakdown && !overrideReason) {
    redirect(`/staff/bookings/${bookingId}?error=quotationReasonRequired`);
  }

  await bookingService.sendQuotation(ctx, bookingId, {
    priceMinor,
    currency,
    overrideReason: deviatesFromBreakdown ? overrideReason : undefined,
  });
  revalidatePath(`/staff/bookings/${bookingId}`);
}

export async function refundBookingAction(bookingId: string) {
  const ctx = await requireStaffContext('booking.confirm');
  const booking = await bookingService.refund(ctx, bookingId);
  if (booking.departureId) await syncFleetAvailabilityForDeparture(booking.organizationId, booking.departureId);
  revalidatePath(`/staff/bookings/${bookingId}`);
}

// DR-108: turns an AWAITING_QUOTATION TAILOR_MADE request into a real,
// reusable DRAFT TourPackage, prefilled from the guest's own plan-my-trip
// answers. Only 4 of the 9 wizard steps have a real TourPackage-shaped
// counterpart (Your trip -> description, Destination -> country,
// Preferences -> tags, Dates -> durationDays); the rest (Travelers/Sites/
// Add-ons/Special requests/Contact) have no matching package field, so per
// explicit user direction they're folded into the description text instead
// of left behind. The composition itself lives in createCustomizedPackageFromBooking
// (src/lib/create-customized-package.ts), shared with DR-111's auto-trigger.
export async function createCustomizedPackageAction(bookingId: string) {
  const ctx = await requireStaffContext('booking.confirm');
  const pkg = await createCustomizedPackageFromBooking(ctx, bookingId);
  redirect(`/staff/packages/${pkg.id}`);
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
//
// DR-149 follow-up: also resyncs fleet availability for the booking's
// departure, same as confirm/cancel/refund above -- a deleted CONFIRMED/
// IN_PROGRESS booking used to leave its assigned vehicle/driver/guide stuck
// at BOOKED forever, since nothing else re-evaluates that departure once
// its only active booking is gone. departureId/organizationId are read
// BEFORE deleteBooking, since the booking is gone (soft-deleted, invisible
// to every read path in this module) immediately after.
//
// DR-151 follow-up: also removes any visa application(s) belonging to the
// booking's travelers, same "orchestrated here, not inside
// bookingService.deleteBooking" reasoning as the itinerary cleanup above --
// visa also already depends on booking. Runs before bookingService
// .deleteBooking for the same reason itinerary's does: visaService
// .deleteForBooking needs bookingService.listTravelers, which needs the
// booking to still be visible.
export async function deleteBookingAction(bookingId: string) {
  const ctx = await requireStaffContext('booking.delete');
  const booking = await bookingService.getById(ctx, bookingId);
  await itineraryService.deleteForBooking(ctx, bookingId);
  await visaService.deleteForBooking(ctx, bookingId);
  await bookingService.deleteBooking(ctx, bookingId);
  if (booking.departureId) await syncFleetAvailabilityForDeparture(booking.organizationId, booking.departureId);
  redirect('/staff/bookings');
}

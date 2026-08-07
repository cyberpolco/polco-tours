'use server';

import type { PaymentKind } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireGuestContext } from '@lib/guest-guard';
import { syncFleetAvailabilityForDeparture } from '@lib/fleet-availability';
import { bookingService } from '@modules/booking';
import { invoicingService } from '@modules/invoicing';

export async function cancelBookingAction(bookingId: string) {
  const ctx = await requireGuestContext();
  const booking = await bookingService.cancel(ctx, bookingId);
  // DR-082: a cancelled booking may free up the vehicle/driver/guide it was
  // holding -- orchestrated here (not inside bookingService.cancel), same
  // "cross-module side effect stays at the caller layer" convention as
  // deleteBookingAction's itinerary cleanup.
  if (booking.departureId) await syncFleetAvailabilityForDeparture(booking.organizationId, booking.departureId);
  revalidatePath(`/booking/${bookingId}`);
}

export async function initiatePaymentAction(invoiceId: string, kind: PaymentKind, bookingId: string) {
  const ctx = await requireGuestContext();
  await invoicingService.initiatePayment(ctx, invoiceId, kind);
  revalidatePath(`/booking/${bookingId}`);
}

export async function acceptQuotationAction(bookingId: string) {
  const ctx = await requireGuestContext();
  await bookingService.acceptQuotation(ctx, bookingId);
  revalidatePath(`/booking/${bookingId}`);
}

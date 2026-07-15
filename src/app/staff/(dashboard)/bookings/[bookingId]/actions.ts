'use server';

import type { PaymentKind } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireStaffContext } from '@lib/staff-guard';
import { bookingService } from '@modules/booking';
import { invoicingService } from '@modules/invoicing';

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

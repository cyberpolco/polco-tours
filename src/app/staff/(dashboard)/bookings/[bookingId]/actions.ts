'use server';

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

export async function initiatePaymentAction(invoiceId: string, kind: 'DEPOSIT' | 'BALANCE', bookingId: string) {
  const ctx = await requireStaffContext('payment.initiate');
  await invoicingService.initiatePayment(ctx, invoiceId, kind);
  revalidatePath(`/staff/bookings/${bookingId}`);
}

export async function resolvePaymentAction(paymentId: string, outcome: 'SUCCEEDED' | 'FAILED', bookingId: string) {
  const ctx = await requireStaffContext('payment.resolve');
  await invoicingService.resolvePayment(ctx, paymentId, outcome);
  revalidatePath(`/staff/bookings/${bookingId}`);
}

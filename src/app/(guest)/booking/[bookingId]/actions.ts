'use server';

import { revalidatePath } from 'next/cache';
import { requireGuestContext } from '@lib/guest-guard';
import { bookingService } from '@modules/booking';
import { invoicingService } from '@modules/invoicing';

export async function cancelBookingAction(bookingId: string) {
  const ctx = await requireGuestContext();
  await bookingService.cancel(ctx, bookingId);
  revalidatePath(`/booking/${bookingId}`);
}

export async function initiatePaymentAction(invoiceId: string, kind: 'DEPOSIT' | 'BALANCE', bookingId: string) {
  const ctx = await requireGuestContext();
  await invoicingService.initiatePayment(ctx, invoiceId, kind);
  revalidatePath(`/booking/${bookingId}`);
}

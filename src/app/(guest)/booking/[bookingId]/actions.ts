'use server';

import type { PaymentKind } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireGuestContext } from '@lib/guest-guard';
import { bookingService } from '@modules/booking';
import { invoicingService } from '@modules/invoicing';

export async function cancelBookingAction(bookingId: string) {
  const ctx = await requireGuestContext();
  await bookingService.cancel(ctx, bookingId);
  revalidatePath(`/booking/${bookingId}`);
}

export async function initiatePaymentAction(invoiceId: string, kind: PaymentKind, bookingId: string) {
  const ctx = await requireGuestContext();
  await invoicingService.initiatePayment(ctx, invoiceId, kind);
  revalidatePath(`/booking/${bookingId}`);
}

export async function requestQuotationAction(bookingId: string) {
  const ctx = await requireGuestContext();
  await bookingService.requestQuotation(ctx, bookingId);
  revalidatePath(`/booking/${bookingId}`);
}

'use server';

import { headers } from 'next/headers';
import { bookingService } from '@modules/booking';
import { invoicingService } from '@modules/invoicing';
import { ApiError } from '@lib/errors';

export interface CancellationActionState {
  status: 'idle' | 'success';
  error?: string;
  refundTier?: string;
  refundAmountMinor?: number;
  currency?: string;
  pdfBase64?: string;
}

// DR-207: heavily-regulated guest self-service cancellation from the
// find-booking result page. Re-verifies bookingReference+lastName+email
// server-side (bookingService.cancelForBookingLookup does its own
// rate-limited, anti-enumeration check -- the values passed through here
// are never trusted just because they rendered this page a moment ago).
// The PDF is generated inline and handed back as base64 rather than a
// separate download route, since lookupByBookingReference deliberately
// treats a just-cancelled (CLOSED_BOOKING_STATUSES) booking as a dead end
// -- this is the guest's one shot at it; see
// invoicingService.generateRefundNotePdfForBookingLookup's own comment.
export async function requestCancellationAction(
  bookingReference: string,
  lastName: string,
  locale: 'en' | 'fr',
  _prevState: CancellationActionState,
  formData: FormData,
): Promise<CancellationActionState> {
  const email = String(formData.get('email') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim();
  const confirmed = formData.get('confirm') === 'on';

  if (!confirmed) return { status: 'idle', error: 'confirmRequired' };
  if (!email) return { status: 'idle', error: 'emailRequired' };
  if (!reason) return { status: 'idle', error: 'reasonRequired' };

  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim();

  try {
    const { booking, refundTier } = await bookingService.cancelForBookingLookup({
      bookingReference,
      lastName,
      email,
      reason,
      ip,
    });
    const refund = await invoicingService.recordCancellationRefund(booking.organizationId, booking.id, refundTier);
    const pdf = await invoicingService.generateRefundNotePdfForBookingLookup(booking.organizationId, booking, locale);

    return {
      status: 'success',
      refundTier,
      refundAmountMinor: refund?.refundAmountMinor,
      currency: refund?.currency,
      pdfBase64: pdf ? pdf.body.toString('base64') : undefined,
    };
  } catch (err) {
    if (err instanceof ApiError && err.status === 429) return { status: 'idle', error: 'tooManyAttempts' };
    if (err instanceof ApiError) return { status: 'idle', error: 'notFound' };
    throw err;
  }
}

'use server';

import { redirect } from 'next/navigation';
import { requireGuestContext } from '@lib/guest-guard';
import { bookingService } from '@modules/booking';
import { documentsService } from '@modules/documents';

export async function uploadPassportAction(bookingId: string, travelerId: string, formData: FormData): Promise<void> {
  const ctx = await requireGuestContext();

  const file = formData.get('passport');
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/booking/${bookingId}/passport?error=missing_file`);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const doc = await documentsService.uploadPassport(ctx, {
    contentType: file.type,
    sizeBytes: file.size,
    bytes,
  });
  await bookingService.setTravelerPassport(ctx, bookingId, travelerId, doc.id);

  // Every traveler needs one when this step applies at all -- loop back
  // here for the next one still missing a passport, or move on once none
  // are left.
  const travelers = await bookingService.listTravelers(ctx, bookingId);
  redirect(
    travelers.some((t) => !t.passportDocumentId) ? `/booking/${bookingId}/passport` : `/booking/${bookingId}`,
  );
}

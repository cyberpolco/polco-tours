'use server';

import { redirect } from 'next/navigation';
import { requireGuestContext } from '@lib/guest-guard';
import { bookingService } from '@modules/booking';
import { documentsService } from '@modules/documents';
import { visaService } from '@modules/visa';

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

  // DR-060: best-effort -- never let a visa-application hiccup fail the
  // passport upload itself (see autoSubmitOnPassportUpload's own comment).
  try {
    await visaService.autoSubmitOnPassportUpload(ctx, bookingId, travelerId);
  } catch {
    // Falls back to the /staff/visa-queue "Needs application" reconciliation
    // view, which a facilitator can act on manually.
  }

  // Every traveler needs one when this step applies at all -- loop back
  // here for the next one still missing a passport, or move on once none
  // are left.
  const travelers = await bookingService.listTravelers(ctx, bookingId);
  redirect(
    travelers.some((t) => !t.passportDocumentId) ? `/booking/${bookingId}/passport` : `/booking/${bookingId}`,
  );
}

'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { bookingService } from '@modules/booking';
import { documentsService } from '@modules/documents';
import { visaService } from '@modules/visa';

export async function uploadPassportAction(bookingId: string, travelerId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('booking.create');

  const file = formData.get('passport');
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/staff/bookings/${bookingId}/passport?error=missing_file`);
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

  const travelers = await bookingService.listTravelers(ctx, bookingId);
  redirect(
    travelers.some((t) => !t.passportDocumentId) ? `/staff/bookings/${bookingId}/passport` : `/staff/bookings/${bookingId}`,
  );
}

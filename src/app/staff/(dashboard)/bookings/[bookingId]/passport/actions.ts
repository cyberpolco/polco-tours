'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { createCustomizedPackageFromBooking } from '@lib/create-customized-package';
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
  if (travelers.some((t) => !t.passportDocumentId)) {
    redirect(`/staff/bookings/${bookingId}/passport`);
  }

  // DR-111: same auto-create-and-redirect as the traveler-setup step, for a
  // TAILOR_MADE booking whose add-ons required a passport upload -- this is
  // the true end of setup in that case, not the traveler step.
  const booking = await bookingService.getById(ctx, bookingId);
  if (booking.origin === 'TAILOR_MADE' && !booking.customizedPackageId) {
    const pkg = await createCustomizedPackageFromBooking(ctx, bookingId);
    redirect(`/staff/packages/${pkg.id}`);
  }
  redirect(`/staff/bookings/${bookingId}`);
}

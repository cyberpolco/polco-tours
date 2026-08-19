'use server';

import { redirect } from 'next/navigation';
import { requireGuestContext } from '@lib/guest-guard';
import { documentsService } from '@modules/documents';
import { bookingService } from '@modules/booking';
import { visaService } from '@modules/visa';

// DR-154: guest self-service resubmit-on-rejection -- same upload shape as
// booking/[bookingId]/passport/actions.ts's uploadPassportAction (validate
// file -> documentsService.uploadPassport -> bookingService
// .setTravelerPassport), then visaService.resubmitApplicationForGuest resets
// the application back to SUBMITTED. The tour lead's session may act on
// behalf of any traveler on the booking, same as the initial passport
// wizard -- findTraveler's ownership check (via bookingService.listTravelers)
// is what actually gates this, not a per-traveler identity check.
export async function resubmitVisaAction(bookingId: string, travelerId: string, formData: FormData): Promise<void> {
  const ctx = await requireGuestContext();

  const file = formData.get('passport');
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/booking/${bookingId}/visa?error=missing_file`);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const doc = await documentsService.uploadPassport(ctx, {
    contentType: file.type,
    sizeBytes: file.size,
    bytes,
  });
  await bookingService.setTravelerPassport(ctx, bookingId, travelerId, doc.id);
  await visaService.resubmitApplicationForGuest(ctx, bookingId, travelerId);

  redirect(`/booking/${bookingId}/visa`);
}

'use server';

import { requireGuestContext } from '@lib/guest-guard';
import { bookingService } from '@modules/booking';
import { documentsService } from '@modules/documents';
import { visaService } from '@modules/visa';

/** DR-216 (done in DR-257): the browser now uploads the PDF straight to
 * Blob (api/v1/documents/passport-upload) and this only records the result,
 * so a passport between Vercel's ~4.5MB request-body cap and the 10MB this
 * app advertises no longer fails at the platform boundary. Only `pathname`
 * crosses from the client and it is not trusted -- documentsService re-reads
 * the stored file's own content type and size before writing anything. */
export async function recordPassportAction(bookingId: string, travelerId: string, pathname: string): Promise<void> {
  const ctx = await requireGuestContext();
  const booking = await bookingService.getById(ctx, bookingId);
  const doc = await documentsService.recordUploadedPassport(booking.organizationId, ctx.userId, pathname);
  await bookingService.setTravelerPassport(ctx, bookingId, travelerId, doc.id);

  // DR-060: best-effort -- never let a visa-application hiccup fail the
  // passport upload itself (see autoSubmitOnPassportUpload's own comment).
  try {
    await visaService.autoSubmitOnPassportUpload(ctx, bookingId, travelerId);
  } catch {
    // Falls back to the /staff/visa-queue "Needs application" reconciliation
    // view, which a facilitator can act on manually.
  }
}

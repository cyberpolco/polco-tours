import { NextRequest, NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { cookies } from 'next/headers';
import { MAX_PASSPORT_SIZE_BYTES, PASSPORT_CONTENT_TYPE } from '@modules/documents';
import { authService } from '@modules/auth';
import { BOOKING_SETUP_COOKIE, readBookingSetupToken } from '@lib/booking-setup-token';
import { ApiError, Errors, problemResponse } from '@lib/errors';
import { logger, newTraceId } from '@lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DR-216 (deferred since DR-163, done in DR-257): passport PDFs uploaded
 * straight from the browser to Vercel Blob instead of proxied through a
 * Server Action.
 *
 * Why it had to change: Vercel serverless functions cap a request body at
 * ~4.5MB, but documents/domain.ts advertises a 10MB passport allowance --
 * so any PDF between those two numbers failed at the platform boundary
 * before the app's own size check ever ran, with no useful error. A Route
 * Handler would not have helped (same body cap); a direct client upload is
 * the only route around it.
 *
 * Same two-caller shape as cms/media-upload (DR-163), and NOT wrapped in
 * withAuth for the same reason: Vercel's own upload-completed callback
 * carries no session cookie and is verified by handleUpload's own request
 * signature, so a blanket guard would reject it before that check.
 *
 * Unlike that route, this one writes to the PRIVATE documents store. The
 * client token is therefore constrained as tightly as the format allows:
 * PDF only, 10MB ceiling (the same MAX_PASSPORT_SIZE_BYTES the server-side
 * validator uses), a random suffix so a caller cannot choose or overwrite
 * an existing pathname, and a short validity. `access` is not settable on
 * the token -- it comes from the store, which is private store-wide
 * (DR-130), so nothing uploaded here is ever publicly readable.
 *
 * Authorised for either caller of the passport step:
 *   - the session-gated wizard (a real anonymous guest session), or
 *   - the /complete-booking flow, whose booking_setup cookie already
 *     represents a passed three-factor check (DR-257).
 * onUploadCompleted is a no-op: the Document row is written by the
 * browser's own follow-up Server Action once upload() resolves, so there
 * is no race between the two.
 */
const TOKEN_VALID_MINUTES = 10;

async function assertMayUploadPassport(request: NextRequest): Promise<void> {
  const setupBookingId = readBookingSetupToken((await cookies()).get(BOOKING_SETUP_COOKIE)?.value);
  if (setupBookingId) return;

  // Falls back to a real session (the session-gated wizard). resolveSession
  // makes no staff/guest distinction, which is fine here -- any signed-in
  // caller is then still bound by the Server Action that records the
  // document, which re-checks the traveler actually belongs to their booking.
  const ctx = await authService.resolveSession(request.headers);
  if (!ctx.userId) throw Errors.forbidden('Not permitted to upload a passport');
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const traceId = request.headers.get('x-trace-id') ?? newTraceId();
  const body = (await request.json()) as HandleUploadBody;

  try {
    if (body.type === 'blob.generate-client-token') {
      await assertMayUploadPassport(request);
    }

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [PASSPORT_CONTENT_TYPE],
        maximumSizeInBytes: MAX_PASSPORT_SIZE_BYTES,
        addRandomSuffix: true,
        validUntil: Date.now() + TOKEN_VALID_MINUTES * 60 * 1000,
      }),
      onUploadCompleted: async () => {
        // Intentional no-op -- see module comment above.
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    if (err instanceof ApiError) return problemResponse(err, { traceId });
    logger(traceId).error('passport-upload route error', {
      message: err instanceof Error ? err.message : String(err),
    });
    return problemResponse(Errors.internal(), { traceId });
  }
}

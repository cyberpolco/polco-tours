import { NextRequest, NextResponse } from 'next/server';
import { bookingService } from '@modules/booking';
import { invoicingService, type PdfLocale } from '@modules/invoicing';
import { ApiError, Errors, problemResponse } from '@lib/errors';
import { logger, newTraceId } from '@lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseLocale(value: string | null): PdfLocale {
  return value === 'fr' ? 'fr' : 'en';
}

/**
 * DR-175: the guest "find my booking" flow's own invoice/receipt download --
 * NOT wrapped in `withAuth` (`src/lib/route-guard.ts`), same "public,
 * no-ctx, does its own trust check" shape as the /rate and /find-booking
 * pages themselves. There is no session tying this browser to the booking
 * (the guest may be looking it up from a different device entirely), so
 * ownership can't come from a cookie the way the authenticated
 * /api/v1/bookings/[bookingId]/invoice/pdf route gets it -- instead this
 * route re-runs the exact same two-factor bookingReference+lastName check
 * (bookingService.lookupByBookingReference) the find-booking/result page
 * itself already ran to even show a download link, complete with that
 * method's own rate-limiting (429 after repeated failed attempts) and
 * "never reveal which part was wrong" 404-on-mismatch behavior.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const traceId = request.headers.get('x-trace-id') ?? newTraceId();
  try {
    const bookingReference = request.nextUrl.searchParams.get('bookingReference');
    const lastName = request.nextUrl.searchParams.get('lastName');
    if (!bookingReference || !lastName) {
      throw Errors.validation('bookingReference and lastName are both required');
    }
    const locale = parseLocale(request.nextUrl.searchParams.get('locale'));
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();

    const { booking, travelers } = await bookingService.lookupByBookingReference(
      { bookingReference: bookingReference.trim().toUpperCase(), lastName },
      ip,
    );

    const pdf = await invoicingService.streamInvoicePdfForBookingLookup(
      booking.organizationId,
      booking.id,
      booking.bookingReference,
      travelers,
      locale,
    );
    if (!pdf) throw Errors.notFound('No downloadable invoice for this booking yet');

    return new NextResponse(pdf.body, {
      headers: {
        'Content-Type': pdf.contentType,
        'Content-Disposition': `attachment; filename="${pdf.filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    if (err instanceof ApiError) return problemResponse(err, { traceId });
    logger(traceId).error('find-booking invoice-pdf route error', {
      message: err instanceof Error ? err.message : String(err),
    });
    return problemResponse(Errors.internal(), { traceId });
  }
}

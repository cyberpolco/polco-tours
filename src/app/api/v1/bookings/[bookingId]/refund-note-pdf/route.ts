import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { invoicingService, type PdfLocale } from '@modules/invoicing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  bookingId: string;
}

function parseLocale(value: string | null): PdfLocale {
  return value === 'fr' ? 'fr' : 'en';
}

// DR-207: staff-side download/regeneration of a booking's cancellation &
// refund note -- same thin pass-through shape as the invoice pdf route.
// Ownership is inherited from bookingService.getById inside
// invoicingService.streamRefundNotePdf; a 404 there means the booking was
// never cancelled through the guest self-service flow.
export const GET = withAuth<Params>('booking.read', async (ctx, req, { bookingId }) => {
  const locale = parseLocale(req.nextUrl.searchParams.get('locale'));
  const pdf = await invoicingService.streamRefundNotePdf(ctx, bookingId, locale);
  return new NextResponse(pdf.body, {
    headers: {
      'Content-Type': pdf.contentType,
      'Content-Disposition': `attachment; filename="${pdf.filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});

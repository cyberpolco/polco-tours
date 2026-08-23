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

// Thin pass-through, same shape as the package/itinerary summary-pdf
// routes -- ownership is inherited from bookingService.getById inside
// invoicingService.streamInvoicePdf, and the pre-payment 409 comes from
// canDownloadInvoicePdf.
export const GET = withAuth<Params>('invoice.read', async (ctx, req, { bookingId }) => {
  const locale = parseLocale(req.nextUrl.searchParams.get('locale'));
  const pdf = await invoicingService.streamInvoicePdf(ctx, bookingId, locale);
  return new NextResponse(pdf.body, {
    headers: {
      'Content-Type': pdf.contentType,
      'Content-Disposition': `attachment; filename="${pdf.filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});

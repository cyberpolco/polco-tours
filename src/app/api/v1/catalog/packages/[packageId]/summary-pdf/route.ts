import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { financeService, type PdfLocale } from '@modules/finance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  packageId: string;
}

function parseLocale(value: string | null): PdfLocale {
  return value === 'fr' ? 'fr' : 'en';
}

// Thin pass-through, same shape as the itinerary map-pdf route -- all
// business logic (resolving the breakdown/day-template/rate data and
// rendering the PDF) lives in financeService.generatePackageSummaryPdf.
export const GET = withAuth<Params>('catalog.write', async (ctx, req, { packageId }) => {
  const locale = parseLocale(req.nextUrl.searchParams.get('locale'));
  const pdf = await financeService.generatePackageSummaryPdf(ctx, packageId, locale);
  return new NextResponse(pdf.body, {
    headers: {
      'Content-Type': pdf.contentType,
      'Content-Disposition': 'attachment; filename="package-summary.pdf"',
      'Cache-Control': 'private, no-store',
    },
  });
});

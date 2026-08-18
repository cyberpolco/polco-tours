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

// DR-152 (explicit user request): the client-facing counterpart to
// summary-pdf/route.ts's staff download -- same thin pass-through shape,
// all business logic lives in financeService.generateClientPackageSummaryPdf.
export const GET = withAuth<Params>('catalog.write', async (ctx, req, { packageId }) => {
  const locale = parseLocale(req.nextUrl.searchParams.get('locale'));
  const pdf = await financeService.generateClientPackageSummaryPdf(ctx, packageId, locale);
  return new NextResponse(pdf.body, {
    headers: {
      'Content-Type': pdf.contentType,
      'Content-Disposition': `attachment; filename="${pdf.filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});

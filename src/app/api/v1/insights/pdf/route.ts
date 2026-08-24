import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import {
  DASHBOARD_SECTION_KEYS,
  insightsService,
  isDashboardSectionKey,
  type DashboardSectionKey,
  type DateRange,
  type PdfLocale,
} from '@modules/insights';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseLocale(value: string | null): PdfLocale {
  return value === 'fr' ? 'fr' : 'en';
}

// DR-193: `sections` is an explicit staff choice, not always "everything" --
// an empty/missing/garbage param falls back to every section rather than an
// empty report, same "fail open to the full picture" posture as the live
// dashboard itself (which has no partial-view mode at all).
function parseSections(value: string | null): DashboardSectionKey[] {
  if (!value) return [...DASHBOARD_SECTION_KEYS];
  const requested = value.split(',').filter(isDashboardSectionKey);
  return requested.length > 0 ? requested : [...DASHBOARD_SECTION_KEYS];
}

// Thin pass-through, same shape as the itinerary map-pdf/catalog
// summary-pdf routes -- all business logic (the insights.read + isInsights
// Viewer gate, re-deriving the same cached summary the live page polls,
// rendering the PDF) lives in insightsService.generateDashboardPdf.
export const GET = withAuth('insights.read', async (ctx, req) => {
  const { searchParams } = new URL(req.url);
  const range: DateRange = { from: parseDate(searchParams.get('from')), to: parseDate(searchParams.get('to')) };
  const sections = parseSections(searchParams.get('sections'));
  const locale = parseLocale(searchParams.get('locale'));

  const pdf = await insightsService.generateDashboardPdf(ctx, range, sections, locale);
  return new NextResponse(pdf.body, {
    headers: {
      'Content-Type': pdf.contentType,
      'Content-Disposition': `attachment; filename="${pdf.filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});

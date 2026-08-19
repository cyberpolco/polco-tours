import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { insightsService, type DateRange } from '@modules/insights';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Insights & Decision Making (DR-038) -- read-only executive dashboard,
// whole-org, no caller-supplied id, same safe shape as /visa/queue.
// DR-155: also the client dashboard's own 30s-polling target and accepts
// an optional ?from=&to= (ISO datetimes) date-range filter -- range: null
// on either side means "no bound," matching the original all-time snapshot
// when neither is supplied.
export const GET = withAuth('insights.read', async (ctx, req) => {
  const { searchParams } = new URL(req.url);
  const range: DateRange = { from: parseDate(searchParams.get('from')), to: parseDate(searchParams.get('to')) };
  const summary = await insightsService.getDashboardSummary(ctx, range);
  return NextResponse.json({ summary });
});

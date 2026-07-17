import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { insightsService } from '@modules/insights';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Insights & Decision Making (DR-038) -- read-only executive dashboard,
// whole-org, no caller-supplied id, same safe shape as /visa/queue.
export const GET = withAuth('insights.read', async (ctx) => {
  const summary = await insightsService.getDashboardSummary(ctx);
  return NextResponse.json({ summary });
});

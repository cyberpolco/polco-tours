import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { ratingsService } from '@modules/ratings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Staff moderation/insights view (DR-037) -- aggregate scores + individual
// reviews. No caller-supplied id (whole-org), same safe shape as
// /api/v1/visa/queue.
export const GET = withAuth('rating.read', async (ctx) => {
  const [reviews, summary] = await Promise.all([
    ratingsService.listReviews(ctx),
    ratingsService.getAggregateSummary(ctx),
  ]);
  return NextResponse.json({ reviews, summary });
});

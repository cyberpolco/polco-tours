import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { ratingsService } from '@modules/ratings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  reviewId: string;
}

// DR-148: genuine hard delete of an individual review -- route passes via
// the DB-editable permission matrix, ratingsService.deleteReview's own
// isRatingDeleter check is the real SUPERADMIN-only gate.
export const DELETE = withAuth<Params>('rating.delete', async (ctx, _req, { reviewId }) => {
  await ratingsService.deleteReview(ctx, reviewId);
  return new NextResponse(null, { status: 204 });
});

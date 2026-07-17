import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { ratingsService } from '@modules/ratings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  bookingId: string;
}

// Customer Ratings & Feedback (DR-037) -- staff generates a single-use
// Rating Code once a booking's invoice is PAID. gated on rating.issue
// (a new module's own row-creating permission, not booking.confirm --
// mirrors itinerary.write's precedent, not convertToItineraryAction's).
export const POST = withAuth<Params>('rating.issue', async (ctx, _req, { bookingId }) => {
  const ratingCode = await ratingsService.issueRatingCode(ctx, bookingId);
  return NextResponse.json({ ratingCode }, { status: 201 });
});

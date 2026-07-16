import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { itineraryService } from '@modules/itinerary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  itineraryId: string;
}

// DRAFT -> IN_REVIEW ("Platform Admin can: Review assigned itineraries").
export const POST = withAuth<Params>('itinerary.write', async (ctx, _req, { itineraryId }) => {
  const itinerary = await itineraryService.submitForReview(ctx, itineraryId);
  return NextResponse.json({ itinerary });
});

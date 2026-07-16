import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { itineraryService } from '@modules/itinerary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  itineraryId: string;
}

// IN_REVIEW -> DRAFT (sends it back for edits).
export const POST = withAuth<Params>('itinerary.write', async (ctx, _req, { itineraryId }) => {
  const itinerary = await itineraryService.sendBackToDraft(ctx, itineraryId);
  return NextResponse.json({ itinerary });
});

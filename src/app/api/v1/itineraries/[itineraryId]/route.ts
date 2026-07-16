import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { UpdateItineraryInput, itineraryService } from '@modules/itinerary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  itineraryId: string;
}

export const GET = withAuth<Params>('itinerary.read', async (ctx, _req, { itineraryId }) => {
  const itinerary = await itineraryService.getItinerary(ctx, itineraryId);
  return NextResponse.json({ itinerary });
});

export const PATCH = withAuth<Params>('itinerary.write', async (ctx, req: NextRequest, { itineraryId }) => {
  const input = UpdateItineraryInput.parse(await req.json());
  const itinerary = await itineraryService.updateItinerary(ctx, itineraryId, input);
  return NextResponse.json({ itinerary });
});

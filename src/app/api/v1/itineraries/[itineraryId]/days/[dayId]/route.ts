import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { UpdateItineraryDayInput, itineraryService } from '@modules/itinerary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  itineraryId: string;
  dayId: string;
}

export const PATCH = withAuth<Params>('itinerary.write', async (ctx, req: NextRequest, { itineraryId, dayId }) => {
  const input = UpdateItineraryDayInput.parse(await req.json());
  const day = await itineraryService.updateDay(ctx, itineraryId, dayId, input);
  return NextResponse.json({ day });
});

export const DELETE = withAuth<Params>('itinerary.write', async (ctx, _req, { itineraryId, dayId }) => {
  await itineraryService.removeDay(ctx, itineraryId, dayId);
  return new NextResponse(null, { status: 204 });
});

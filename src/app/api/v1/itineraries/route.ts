import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { itineraryService } from '@modules/itinerary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Manager-only (itineraryService.listAll enforces this) -- a TOUR_GUIDE/
// DRIVER looks up their own assigned itineraries via GET /itineraries/mine.
export const GET = withAuth('itinerary.write', async (ctx) => {
  const itineraries = await itineraryService.listAll(ctx);
  return NextResponse.json({ itineraries });
});

import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { itineraryService } from '@modules/itinerary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// TOUR_GUIDE/DRIVER: "read-only access to their assigned itineraries" (DR-033).
export const GET = withAuth('itinerary.read', async (ctx) => {
  const itineraries = await itineraryService.listMine(ctx);
  return NextResponse.json({ itineraries });
});

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { Errors, problemResponse } from '@lib/errors';
import { itineraryService } from '@modules/itinerary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Static sibling of the [itineraryId] dynamic segment -- same coexistence
// pattern this route tree already uses for /itineraries/mine.
export const GET = withAuth('itinerary.read', async (ctx, req: NextRequest) => {
  const bookingReference = req.nextUrl.searchParams.get('bookingReference');
  if (!bookingReference) return problemResponse(Errors.validation('bookingReference is required'));

  const overview = await itineraryService.resolveMapOverview(ctx, bookingReference);
  return NextResponse.json(overview);
});

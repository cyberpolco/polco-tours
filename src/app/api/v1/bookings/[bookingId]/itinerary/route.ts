import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { Errors, problemResponse } from '@lib/errors';
import { CreateItineraryInput, itineraryService } from '@modules/itinerary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  bookingId: string;
}

export const GET = withAuth<Params>('itinerary.read', async (ctx, _req, { bookingId }) => {
  const itinerary = await itineraryService.getItineraryForBooking(ctx, bookingId);
  if (!itinerary) return problemResponse(Errors.notFound('No itinerary exists for this booking'));
  return NextResponse.json({ itinerary });
});

export const POST = withAuth<Params>('itinerary.write', async (ctx, req: NextRequest, { bookingId }) => {
  const input = CreateItineraryInput.parse(await req.json().catch(() => ({})));
  const itinerary = await itineraryService.createItinerary(ctx, bookingId, input);
  return NextResponse.json({ itinerary }, { status: 201 });
});

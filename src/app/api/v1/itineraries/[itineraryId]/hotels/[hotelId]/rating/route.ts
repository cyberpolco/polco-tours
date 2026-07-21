import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { RateHotelInput, itineraryService } from '@modules/itinerary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  itineraryId: string;
  hotelId: string;
}

// Staff-only 5-star rating -- itinerary.read is enough to fetch your own
// rating (itineraryService.getMyHotelRating re-checks itinerary access
// itself); writing needs the narrower hotel_restaurant_rating.write.
export const GET = withAuth<Params>('itinerary.read', async (ctx, _req, { itineraryId, hotelId }) => {
  const rating = await itineraryService.getMyHotelRating(ctx, itineraryId, hotelId);
  return NextResponse.json({ rating });
});

export const POST = withAuth<Params>('hotel_restaurant_rating.write', async (ctx, req: NextRequest, { itineraryId, hotelId }) => {
  const input = RateHotelInput.parse(await req.json());
  const rating = await itineraryService.rateHotel(ctx, itineraryId, hotelId, input);
  return NextResponse.json({ rating }, { status: 201 });
});

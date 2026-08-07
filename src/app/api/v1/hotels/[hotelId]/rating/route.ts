import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { RateHotelInput, itineraryService } from '@modules/itinerary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  hotelId: string;
}

// DR-083: moved off /itineraries/{itineraryId}/hotels/{hotelId}/rating --
// rating is now scoped to the hotel directly, not a specific itinerary.
// itinerary.read is enough to fetch your own rating (itineraryService.
// getMyHotelRating has no anti-BOLA gate of its own); writing needs the
// narrower hotel_restaurant_rating.write, and itineraryService.rateHotel
// itself re-checks a non-manager actually toured this hotel.
export const GET = withAuth<Params>('itinerary.read', async (ctx, _req, { hotelId }) => {
  const rating = await itineraryService.getMyHotelRating(ctx, hotelId);
  return NextResponse.json({ rating });
});

export const POST = withAuth<Params>('hotel_restaurant_rating.write', async (ctx, req: NextRequest, { hotelId }) => {
  const input = RateHotelInput.parse(await req.json());
  const rating = await itineraryService.rateHotel(ctx, hotelId, input);
  return NextResponse.json({ rating }, { status: 201 });
});

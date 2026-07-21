import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { RateRestaurantInput, itineraryService } from '@modules/itinerary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  itineraryId: string;
  restaurantId: string;
}

// Restaurant counterpart to the hotel rating route -- identical shape.
export const GET = withAuth<Params>('itinerary.read', async (ctx, _req, { itineraryId, restaurantId }) => {
  const rating = await itineraryService.getMyRestaurantRating(ctx, itineraryId, restaurantId);
  return NextResponse.json({ rating });
});

export const POST = withAuth<Params>(
  'hotel_restaurant_rating.write',
  async (ctx, req: NextRequest, { itineraryId, restaurantId }) => {
    const input = RateRestaurantInput.parse(await req.json());
    const rating = await itineraryService.rateRestaurant(ctx, itineraryId, restaurantId, input);
    return NextResponse.json({ rating }, { status: 201 });
  },
);

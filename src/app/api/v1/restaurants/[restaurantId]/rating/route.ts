import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { RateRestaurantInput, itineraryService } from '@modules/itinerary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  restaurantId: string;
}

// Restaurant counterpart to the hotel rating route -- identical shape.
export const GET = withAuth<Params>('itinerary.read', async (ctx, _req, { restaurantId }) => {
  const rating = await itineraryService.getMyRestaurantRating(ctx, restaurantId);
  return NextResponse.json({ rating });
});

export const POST = withAuth<Params>('hotel_restaurant_rating.write', async (ctx, req: NextRequest, { restaurantId }) => {
  const input = RateRestaurantInput.parse(await req.json());
  const rating = await itineraryService.rateRestaurant(ctx, restaurantId, input);
  return NextResponse.json({ rating }, { status: 201 });
});

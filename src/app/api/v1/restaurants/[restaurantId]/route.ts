import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { UpdateRestaurantInput, itineraryService } from '@modules/itinerary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  restaurantId: string;
}

export const GET = withAuth<Params>('itinerary.read', async (ctx, _req, { restaurantId }) => {
  const restaurant = await itineraryService.getRestaurant(ctx, restaurantId);
  return NextResponse.json({ restaurant });
});

export const PATCH = withAuth<Params>('itinerary.write', async (ctx, req: NextRequest, { restaurantId }) => {
  const input = UpdateRestaurantInput.parse(await req.json());
  const restaurant = await itineraryService.updateRestaurant(ctx, restaurantId, input);
  return NextResponse.json({ restaurant });
});

export const DELETE = withAuth<Params>('itinerary.write', async (ctx, _req, { restaurantId }) => {
  await itineraryService.deleteRestaurant(ctx, restaurantId);
  return new NextResponse(null, { status: 204 });
});

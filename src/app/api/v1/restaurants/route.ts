import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { CreateRestaurantInput, itineraryService } from '@modules/itinerary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth('itinerary.read', async (ctx) => {
  const restaurants = await itineraryService.listRestaurants(ctx);
  return NextResponse.json({ restaurants });
});

export const POST = withAuth('itinerary.write', async (ctx, req: NextRequest) => {
  const input = CreateRestaurantInput.parse(await req.json());
  const restaurant = await itineraryService.createRestaurant(ctx, input);
  return NextResponse.json({ restaurant }, { status: 201 });
});

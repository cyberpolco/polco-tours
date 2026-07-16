import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@lib/route-guard';
import { itineraryService } from '@modules/itinerary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  itineraryId: string;
}

const AssignRestaurantInput = z.object({ restaurantId: z.string().uuid() });

export const GET = withAuth<Params>('itinerary.read', async (ctx, _req, { itineraryId }) => {
  const restaurants = await itineraryService.listAssignedRestaurants(ctx, itineraryId);
  return NextResponse.json({ restaurants });
});

export const POST = withAuth<Params>('itinerary.write', async (ctx, req: NextRequest, { itineraryId }) => {
  const { restaurantId } = AssignRestaurantInput.parse(await req.json());
  await itineraryService.assignRestaurant(ctx, itineraryId, restaurantId);
  const restaurants = await itineraryService.listAssignedRestaurants(ctx, itineraryId);
  return NextResponse.json({ restaurants }, { status: 201 });
});

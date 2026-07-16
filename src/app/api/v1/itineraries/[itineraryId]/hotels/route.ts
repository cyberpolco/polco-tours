import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@lib/route-guard';
import { itineraryService } from '@modules/itinerary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  itineraryId: string;
}

const AssignHotelInput = z.object({ hotelId: z.string().uuid() });

export const GET = withAuth<Params>('itinerary.read', async (ctx, _req, { itineraryId }) => {
  const hotels = await itineraryService.listAssignedHotels(ctx, itineraryId);
  return NextResponse.json({ hotels });
});

export const POST = withAuth<Params>('itinerary.write', async (ctx, req: NextRequest, { itineraryId }) => {
  const { hotelId } = AssignHotelInput.parse(await req.json());
  await itineraryService.assignHotel(ctx, itineraryId, hotelId);
  const hotels = await itineraryService.listAssignedHotels(ctx, itineraryId);
  return NextResponse.json({ hotels }, { status: 201 });
});

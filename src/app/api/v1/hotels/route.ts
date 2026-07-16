import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { CreateHotelInput, itineraryService } from '@modules/itinerary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth('itinerary.read', async (ctx) => {
  const hotels = await itineraryService.listHotels(ctx);
  return NextResponse.json({ hotels });
});

export const POST = withAuth('itinerary.write', async (ctx, req: NextRequest) => {
  const input = CreateHotelInput.parse(await req.json());
  const hotel = await itineraryService.createHotel(ctx, input);
  return NextResponse.json({ hotel }, { status: 201 });
});

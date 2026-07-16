import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { UpdateHotelInput, itineraryService } from '@modules/itinerary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  hotelId: string;
}

export const GET = withAuth<Params>('itinerary.read', async (ctx, _req, { hotelId }) => {
  const hotel = await itineraryService.getHotel(ctx, hotelId);
  return NextResponse.json({ hotel });
});

export const PATCH = withAuth<Params>('itinerary.write', async (ctx, req: NextRequest, { hotelId }) => {
  const input = UpdateHotelInput.parse(await req.json());
  const hotel = await itineraryService.updateHotel(ctx, hotelId, input);
  return NextResponse.json({ hotel });
});

export const DELETE = withAuth<Params>('itinerary.write', async (ctx, _req, { hotelId }) => {
  await itineraryService.deleteHotel(ctx, hotelId);
  return new NextResponse(null, { status: 204 });
});

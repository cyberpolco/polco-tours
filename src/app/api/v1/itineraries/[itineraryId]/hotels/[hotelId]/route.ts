import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { itineraryService } from '@modules/itinerary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  itineraryId: string;
  hotelId: string;
}

export const DELETE = withAuth<Params>('itinerary.write', async (ctx, _req, { itineraryId, hotelId }) => {
  await itineraryService.unassignHotel(ctx, itineraryId, hotelId);
  return new NextResponse(null, { status: 204 });
});

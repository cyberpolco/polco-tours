import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { AddItineraryDayInput, itineraryService } from '@modules/itinerary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  itineraryId: string;
}

export const GET = withAuth<Params>('itinerary.read', async (ctx, _req, { itineraryId }) => {
  const days = await itineraryService.listDays(ctx, itineraryId);
  return NextResponse.json({ days });
});

export const POST = withAuth<Params>('itinerary.write', async (ctx, req: NextRequest, { itineraryId }) => {
  const input = AddItineraryDayInput.parse(await req.json());
  const day = await itineraryService.addDay(ctx, itineraryId, input);
  return NextResponse.json({ day }, { status: 201 });
});

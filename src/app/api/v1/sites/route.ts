import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { CreateSiteInput, itineraryService } from '@modules/itinerary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth('itinerary.read', async (ctx) => {
  const sites = await itineraryService.listSites(ctx);
  return NextResponse.json({ sites });
});

export const POST = withAuth('itinerary.write', async (ctx, req: NextRequest) => {
  const input = CreateSiteInput.parse(await req.json());
  const site = await itineraryService.createSite(ctx, input);
  return NextResponse.json({ site }, { status: 201 });
});

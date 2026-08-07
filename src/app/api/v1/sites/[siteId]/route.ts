import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { UpdateSiteInput, itineraryService } from '@modules/itinerary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  siteId: string;
}

export const GET = withAuth<Params>('itinerary.read', async (ctx, _req, { siteId }) => {
  const site = await itineraryService.getSite(ctx, siteId);
  return NextResponse.json({ site });
});

export const PATCH = withAuth<Params>('itinerary.write', async (ctx, req: NextRequest, { siteId }) => {
  const input = UpdateSiteInput.parse(await req.json());
  const site = await itineraryService.updateSite(ctx, siteId, input);
  return NextResponse.json({ site });
});

export const DELETE = withAuth<Params>('itinerary.write', async (ctx, _req, { siteId }) => {
  await itineraryService.deleteSite(ctx, siteId);
  return new NextResponse(null, { status: 204 });
});

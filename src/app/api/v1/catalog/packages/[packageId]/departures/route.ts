import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { CreateDepartureInput, catalogService } from '@modules/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  packageId: string;
}

export const GET = withAuth<Params>('catalog.read', async (ctx, _req, { packageId }) => {
  const departures = await catalogService.listDepartures(ctx, packageId);
  return NextResponse.json({ departures });
});

export const POST = withAuth<Params>('catalog.write', async (ctx, req: NextRequest, { packageId }) => {
  const input = CreateDepartureInput.parse(await req.json());
  const departure = await catalogService.createDeparture(ctx, packageId, input);
  return NextResponse.json({ departure }, { status: 201 });
});

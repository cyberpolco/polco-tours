import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { CreateVehicleInput, fleetService } from '@modules/fleet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth('fleet.read', async (ctx) => {
  const vehicles = await fleetService.listVehicles(ctx);
  return NextResponse.json({ vehicles });
});

export const POST = withAuth('fleet.write', async (ctx, req: NextRequest) => {
  const input = CreateVehicleInput.parse(await req.json());
  const vehicle = await fleetService.createVehicle(ctx, input);
  return NextResponse.json({ vehicle }, { status: 201 });
});

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { UpdateVehicleInput, fleetService } from '@modules/fleet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  vehicleId: string;
}

export const GET = withAuth<Params>('fleet.read', async (ctx, _req, { vehicleId }) => {
  const vehicle = await fleetService.getVehicle(ctx, vehicleId);
  return NextResponse.json({ vehicle });
});

export const PATCH = withAuth<Params>('fleet.write', async (ctx, req: NextRequest, { vehicleId }) => {
  const input = UpdateVehicleInput.parse(await req.json());
  const vehicle = await fleetService.updateVehicle(ctx, vehicleId, input);
  return NextResponse.json({ vehicle });
});

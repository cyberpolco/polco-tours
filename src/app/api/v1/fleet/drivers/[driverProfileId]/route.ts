import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { UpdateDriverProfileInput, fleetService } from '@modules/fleet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  driverProfileId: string;
}

export const GET = withAuth<Params>('fleet.read', async (ctx, _req, { driverProfileId }) => {
  const driver = await fleetService.getDriverProfile(ctx, driverProfileId);
  return NextResponse.json({ driver });
});

export const PATCH = withAuth<Params>('fleet.write', async (ctx, req: NextRequest, { driverProfileId }) => {
  const input = UpdateDriverProfileInput.parse(await req.json());
  const driver = await fleetService.updateDriverProfile(ctx, driverProfileId, input);
  return NextResponse.json({ driver });
});

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { CreateDriverProfileInput, fleetService } from '@modules/fleet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Managers-only listing (fleetService.listDriverProfiles enforces this) --
// a DRIVER looks up their own profile via GET /fleet/drivers/[driverProfileId].
export const GET = withAuth('fleet.read', async (ctx) => {
  const drivers = await fleetService.listDriverProfiles(ctx);
  return NextResponse.json({ drivers });
});

export const POST = withAuth('fleet.write', async (ctx, req: NextRequest) => {
  const input = CreateDriverProfileInput.parse(await req.json());
  const driver = await fleetService.createDriverProfile(ctx, input);
  return NextResponse.json({ driver }, { status: 201 });
});

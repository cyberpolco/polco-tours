import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { UpdateStarlinkKitInput, fleetService } from '@modules/fleet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  kitId: string;
}

export const GET = withAuth<Params>('fleet.read', async (ctx, _req, { kitId }) => {
  const kit = await fleetService.getStarlinkKit(ctx, kitId);
  return NextResponse.json({ kit });
});

export const PATCH = withAuth<Params>('fleet.write', async (ctx, req: NextRequest, { kitId }) => {
  const input = UpdateStarlinkKitInput.parse(await req.json());
  const kit = await fleetService.updateStarlinkKit(ctx, kitId, input);
  return NextResponse.json({ kit });
});

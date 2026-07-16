import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { SetStarlinkLocationInput, fleetService } from '@modules/fleet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  kitId: string;
}

// Staff-entered position -- no live Starlink API feed yet (see the
// StarlinkKit model comment in schema.prisma).
export const POST = withAuth<Params>('fleet.write', async (ctx, req: NextRequest, { kitId }) => {
  const input = SetStarlinkLocationInput.parse(await req.json());
  const kit = await fleetService.setStarlinkLocation(ctx, kitId, input);
  return NextResponse.json({ kit });
});

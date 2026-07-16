import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { CreateStarlinkKitInput, fleetService } from '@modules/fleet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth('fleet.read', async (ctx) => {
  const kits = await fleetService.listStarlinkKits(ctx);
  return NextResponse.json({ kits });
});

export const POST = withAuth('fleet.write', async (ctx, req: NextRequest) => {
  const input = CreateStarlinkKitInput.parse(await req.json());
  const kit = await fleetService.createStarlinkKit(ctx, input);
  return NextResponse.json({ kit }, { status: 201 });
});

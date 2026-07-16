import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { UpdateGuideProfileInput, fleetService } from '@modules/fleet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  guideProfileId: string;
}

export const GET = withAuth<Params>('fleet.read', async (ctx, _req, { guideProfileId }) => {
  const guide = await fleetService.getGuideProfile(ctx, guideProfileId);
  return NextResponse.json({ guide });
});

export const PATCH = withAuth<Params>('fleet.write', async (ctx, req: NextRequest, { guideProfileId }) => {
  const input = UpdateGuideProfileInput.parse(await req.json());
  const guide = await fleetService.updateGuideProfile(ctx, guideProfileId, input);
  return NextResponse.json({ guide });
});

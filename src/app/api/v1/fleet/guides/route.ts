import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { CreateGuideProfileInput, fleetService } from '@modules/fleet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Managers-only listing (fleetService.listGuideProfiles enforces this) --
// a TOUR_GUIDE looks up their own profile via GET /fleet/guides/[guideProfileId].
export const GET = withAuth('fleet.read', async (ctx) => {
  const guides = await fleetService.listGuideProfiles(ctx);
  return NextResponse.json({ guides });
});

export const POST = withAuth('fleet.write', async (ctx, req: NextRequest) => {
  const input = CreateGuideProfileInput.parse(await req.json());
  const guide = await fleetService.createGuideProfile(ctx, input);
  return NextResponse.json({ guide }, { status: 201 });
});

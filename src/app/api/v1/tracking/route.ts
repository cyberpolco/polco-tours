import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { trackingService } from '@modules/tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Tracking (DR-041) -- read-only "what's happening right now" snapshot,
// whole-org, no caller-supplied id, same safe shape as /insights.
export const GET = withAuth('tracking.read', async (ctx) => {
  const snapshot = await trackingService.getFleetSnapshot(ctx);
  return NextResponse.json({ snapshot });
});

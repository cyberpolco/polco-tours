import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { bookingService } from '@modules/booking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  departureId: string;
}

// Lightweight pre-submit recheck -- avoids the extra catalog lookups the full
// departure-detail route does, for a tourist about to press "hold my seat".
export const GET = withAuth<Params>('catalog.read', async (ctx, _req, { departureId }) => {
  const availability = await bookingService.getAvailability(ctx, departureId);
  return NextResponse.json(availability);
});

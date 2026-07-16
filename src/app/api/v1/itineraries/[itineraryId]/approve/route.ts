import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { itineraryService } from '@modules/itinerary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  itineraryId: string;
}

// "Super Admin can: ... Approve itineraries" -- itinerary.approve (held by
// SUPERADMIN/PLATFORM_ADMIN via '*' and TOUR_OPERATOR, per rbac.ts's
// explicit-choice comment: the literal Super-Admin-vs-Platform-Admin split
// was NOT introduced).
export const POST = withAuth<Params>('itinerary.approve', async (ctx, _req, { itineraryId }) => {
  const itinerary = await itineraryService.approveItinerary(ctx, itineraryId);
  return NextResponse.json({ itinerary });
});

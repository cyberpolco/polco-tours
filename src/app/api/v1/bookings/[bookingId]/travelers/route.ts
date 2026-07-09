import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { AddTravelerInput, bookingService } from '@modules/booking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  bookingId: string;
}

// Ownership (a tourist may only see/add to their own booking) is enforced
// inside bookingService, not here.
export const GET = withAuth<Params>('booking.read', async (ctx, _req, { bookingId }) => {
  const travelers = await bookingService.listTravelers(ctx, bookingId);
  return NextResponse.json({ travelers });
});

export const POST = withAuth<Params>('booking.create', async (ctx, req: NextRequest, { bookingId }) => {
  const input = AddTravelerInput.parse(await req.json());
  const traveler = await bookingService.addTraveler(ctx, bookingId, input);
  return NextResponse.json({ traveler }, { status: 201 });
});

import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { bookingService } from '@modules/booking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  bookingId: string;
}

// Ownership (a tourist may only fetch their own) is enforced inside
// bookingService.getById, not here.
export const GET = withAuth<Params>('booking.read', async (ctx, _req, { bookingId }) => {
  const booking = await bookingService.getById(ctx, bookingId);
  return NextResponse.json({ booking });
});

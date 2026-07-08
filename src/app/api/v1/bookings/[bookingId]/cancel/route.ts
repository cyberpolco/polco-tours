import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { bookingService } from '@modules/booking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  bookingId: string;
}

// Ownership (a tourist may only cancel their own) is enforced inside
// bookingService.cancel, not here.
export const POST = withAuth<Params>('booking.cancel', async (ctx, _req, { bookingId }) => {
  const booking = await bookingService.cancel(ctx, bookingId);
  return NextResponse.json({ booking });
});

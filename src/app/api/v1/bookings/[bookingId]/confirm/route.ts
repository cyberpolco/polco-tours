import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { bookingService } from '@modules/booking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  bookingId: string;
}

// Operator-only in this increment -- there is no DPO payment gate yet
// (OI-01 still open), so confirmation is a manual operator action.
export const POST = withAuth<Params>('booking.confirm', async (ctx, _req, { bookingId }) => {
  const booking = await bookingService.confirm(ctx, bookingId);
  return NextResponse.json({ booking });
});

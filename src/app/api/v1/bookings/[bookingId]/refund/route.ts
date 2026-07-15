import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { bookingService } from '@modules/booking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  bookingId: string;
}

// Staff-only, mirrors payment.resolve's fraud-prevention posture. Status-only
// (CANCELLED -> REFUNDED) -- no real payment-reversal mechanism exists yet.
export const POST = withAuth<Params>('booking.confirm', async (ctx, _req, { bookingId }) => {
  const booking = await bookingService.refund(ctx, bookingId);
  return NextResponse.json({ booking });
});

import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { bookingService } from '@modules/booking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  bookingId: string;
}

// Client accepts a sent quotation and proceeds toward payment
// (QUOTATION_SENT -> AWAITING_DEPOSIT).
export const POST = withAuth<Params>('booking.create', async (ctx, _req, { bookingId }) => {
  const booking = await bookingService.acceptQuotation(ctx, bookingId);
  return NextResponse.json({ booking });
});

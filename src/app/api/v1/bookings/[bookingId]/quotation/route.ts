import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { SendQuotationInput, bookingService } from '@modules/booking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  bookingId: string;
}

// Staff-only: prices a booking currently AWAITING_QUOTATION (applies to a
// TAILOR_MADE request or a PREDEFINED_PACKAGE booking that asked for a quote
// instead of paying immediately).
export const POST = withAuth<Params>('booking.confirm', async (ctx, req: NextRequest, { bookingId }) => {
  const input = SendQuotationInput.parse(await req.json());
  const booking = await bookingService.sendQuotation(ctx, bookingId, input);
  return NextResponse.json({ booking });
});

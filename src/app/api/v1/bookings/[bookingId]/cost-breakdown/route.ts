import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { SaveBookingCostBreakdownInput, financeService } from '@modules/finance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  bookingId: string;
}

export const GET = withAuth<Params>('booking.confirm', async (ctx, _req, { bookingId }) => {
  const breakdown = await financeService.getBookingCostBreakdown(ctx, bookingId);
  return NextResponse.json({ breakdown });
});

// Computes Base Cost -> Selling Price + already-selected add-ons, for a
// TAILOR_MADE booking's suggested quotation total (DR-092) -- unlike the
// package equivalent, this does NOT write Booking.priceMinor/currency or
// send the quotation; sendQuotation (unchanged) stays the actual commit.
export const PUT = withAuth<Params>('booking.confirm', async (ctx, req: NextRequest, { bookingId }) => {
  const input = SaveBookingCostBreakdownInput.parse(await req.json());
  const breakdown = await financeService.saveBookingCostBreakdown(ctx, bookingId, input);
  return NextResponse.json({ breakdown });
});

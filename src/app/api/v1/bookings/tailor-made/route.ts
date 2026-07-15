import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { CreateTailorMadeInput, bookingService } from '@modules/booking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A bespoke trip request with no pre-existing Departure -- staff price it
// manually afterward via POST /bookings/{id}/quotation.
export const POST = withAuth('booking.create', async (ctx, req: NextRequest) => {
  const input = CreateTailorMadeInput.parse(await req.json());
  const booking = await bookingService.createTailorMadeRequest(ctx, input);
  return NextResponse.json({ booking }, { status: 201 });
});

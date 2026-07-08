import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { CreateBookingInput, bookingService } from '@modules/booking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Tourist -> their own bookings only. Staff -> the full org manifest.
// The scope decision is made in bookingService.list, not here (Vol. 5:
// backend decides, route just wires the request through).
export const GET = withAuth('booking.read', async (ctx) => {
  const bookings = await bookingService.list(ctx);
  return NextResponse.json({ bookings });
});

export const POST = withAuth('booking.create', async (ctx, req: NextRequest) => {
  const input = CreateBookingInput.parse(await req.json());
  const booking = await bookingService.createHold(ctx, input);
  return NextResponse.json({ booking }, { status: 201 });
});

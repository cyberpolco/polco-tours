import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { bookingService } from '@modules/booking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  bookingId: string;
}

// DR-028: "Super Admin converts it into an operational itinerary" for an
// approved (priced) TAILOR_MADE booking -- creates a bespoke Departure and
// attaches it, after which the existing Assignment module can attach a
// vehicle/driver/guide to it unchanged.
export const POST = withAuth<Params>('booking.confirm', async (ctx, _req, { bookingId }) => {
  const booking = await bookingService.convertToItinerary(ctx, bookingId);
  return NextResponse.json({ booking });
});

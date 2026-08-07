import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { syncFleetAvailabilityForDeparture } from '@lib/fleet-availability';
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
  // DR-082: a CONFIRMED booking is what marks its assigned vehicle/driver/
  // guide BOOKED -- see cancelBookingAction (guest) for why this lives at
  // the caller layer, not inside bookingService.confirm.
  if (booking.departureId) await syncFleetAvailabilityForDeparture(booking.organizationId, booking.departureId);
  return NextResponse.json({ booking });
});

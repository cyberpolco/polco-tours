import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { syncFleetAvailabilityForDeparture } from '@lib/fleet-availability';
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
  // DR-082: a refunded booking is no longer "current" -- see
  // src/app/(guest)/booking/[bookingId]/actions.ts's cancelBookingAction for
  // why this lives at the caller layer, not inside bookingService.refund.
  if (booking.departureId) await syncFleetAvailabilityForDeparture(booking.organizationId, booking.departureId);
  return NextResponse.json({ booking });
});

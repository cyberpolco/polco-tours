import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { syncFleetAvailabilityForDeparture } from '@lib/fleet-availability';
import { bookingService } from '@modules/booking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  bookingId: string;
}

// Ownership (a tourist may only fetch their own) is enforced inside
// bookingService.getById, not here.
export const GET = withAuth<Params>('booking.read', async (ctx, _req, { bookingId }) => {
  const booking = await bookingService.getById(ctx, bookingId);
  return NextResponse.json({ booking });
});

// DR-058: SUPERADMIN-only, enforced inside bookingService.deleteBooking (the
// route permission alone isn't the real gate -- see that method's comment).
// DR-149: reads departureId/organizationId BEFORE deleting (the booking is
// invisible to every read path in this module immediately after), then
// resyncs fleet availability, same as the staff deleteBookingAction.
export const DELETE = withAuth<Params>('booking.delete', async (ctx, _req, { bookingId }) => {
  const booking = await bookingService.getById(ctx, bookingId);
  await bookingService.deleteBooking(ctx, bookingId);
  if (booking.departureId) await syncFleetAvailabilityForDeparture(booking.organizationId, booking.departureId);
  return new NextResponse(null, { status: 204 });
});

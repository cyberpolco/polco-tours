import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { syncFleetAvailabilityForDeparture } from '@lib/fleet-availability';
import { bookingService } from '@modules/booking';
import { invoicingService } from '@modules/invoicing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  bookingId: string;
}

// Ownership (a tourist may only cancel their own) is enforced inside
// bookingService.cancel, not here.
export const POST = withAuth<Params>('booking.cancel', async (ctx, _req, { bookingId }) => {
  const { booking, refundTier } = await bookingService.cancel(ctx, bookingId);
  // DR-082 -- see the guest cancelBookingAction for why this lives here.
  if (booking.departureId) await syncFleetAvailabilityForDeparture(booking.organizationId, booking.departureId);
  // DR-261 -- same composition as the guest/staff Server Action callers.
  await invoicingService.recordCancellationRefund(booking.organizationId, booking.id, refundTier);
  return NextResponse.json({ booking });
});

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { UpdateTripDatesInput, bookingService } from '@modules/booking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  bookingId: string;
}

// DR-219: reschedules a booking's trip date. `booking.confirm` is the route
// permission (PLATFORM_ADMIN/TOUR_OPERATOR/SUPERADMIN all pass it) --
// bookingService.updateTripDates' own isDepartureDateChanger check is the
// real, narrower gate (SUPERADMIN/TOUR_OPERATOR only), same two-layer
// convention as the confirm route above it.
export const PATCH = withAuth<Params>('booking.confirm', async (ctx, req: NextRequest, { bookingId }) => {
  const input = UpdateTripDatesInput.parse(await req.json());
  const booking = await bookingService.updateTripDates(ctx, bookingId, input);
  return NextResponse.json({ booking });
});

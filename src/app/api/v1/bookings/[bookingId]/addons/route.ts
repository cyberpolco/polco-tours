import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { SetAddonsInput, bookingService } from '@modules/booking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  bookingId: string;
}

export const POST = withAuth<Params>('booking.create', async (ctx, req: NextRequest, { bookingId }) => {
  const input = SetAddonsInput.parse(await req.json());
  const addons = await bookingService.setAddons(ctx, bookingId, input);
  return NextResponse.json({ addons });
});

import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { visaService } from '@modules/visa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  bookingId: string;
  travelerId: string;
}

// DR-184: marks the destination country's government fee as requested from
// the traveler -- a status flag only, no Payment/Invoice created here.
export const POST = withAuth<Params>('visa.process', async (ctx, _req, { bookingId, travelerId }) => {
  const application = await visaService.requestFeePayment(ctx, bookingId, travelerId);
  return NextResponse.json({ application });
});

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { DecideVisaInput, visaService } from '@modules/visa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  bookingId: string;
  travelerId: string;
}

export const POST = withAuth<Params>('visa.process', async (ctx, req: NextRequest, { bookingId, travelerId }) => {
  const input = DecideVisaInput.parse(await req.json());
  const application = await visaService.decideApplication(ctx, bookingId, travelerId, input);
  return NextResponse.json({ application });
});

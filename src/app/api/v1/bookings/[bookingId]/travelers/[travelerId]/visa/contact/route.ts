import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { ContactTravelerInput, visaService } from '@modules/visa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  bookingId: string;
  travelerId: string;
}

export const POST = withAuth<Params>('visa.process', async (ctx, req: NextRequest, { bookingId, travelerId }) => {
  const input = ContactTravelerInput.parse(await req.json());
  await visaService.contactTraveler(ctx, bookingId, travelerId, input);
  return new NextResponse(null, { status: 204 });
});

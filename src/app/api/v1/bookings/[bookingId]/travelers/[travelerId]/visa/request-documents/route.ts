import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { visaService } from '@modules/visa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  bookingId: string;
  travelerId: string;
}

export const POST = withAuth<Params>('visa.process', async (ctx, _req, { bookingId, travelerId }) => {
  await visaService.requestMissingDocuments(ctx, bookingId, travelerId);
  return new NextResponse(null, { status: 204 });
});

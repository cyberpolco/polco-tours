import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { financeService } from '@modules/finance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  id: string;
}

export const DELETE = withAuth<Params>('finance_config.write', async (ctx, _req, { id }) => {
  await financeService.deleteHotelRate(ctx, id);
  return new NextResponse(null, { status: 204 });
});

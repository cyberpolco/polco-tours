import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { CreateActivityFeeInput, financeService } from '@modules/finance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  id: string;
}

export const PATCH = withAuth<Params>('finance_config.write', async (ctx, req: NextRequest, { id }) => {
  const input = CreateActivityFeeInput.parse(await req.json());
  const { fee, reapply } = await financeService.updateActivityFee(ctx, id, input);
  return NextResponse.json({ fee, reapply });
});

export const DELETE = withAuth<Params>('finance_config.write', async (ctx, _req, { id }) => {
  await financeService.deleteActivityFee(ctx, id);
  return new NextResponse(null, { status: 204 });
});

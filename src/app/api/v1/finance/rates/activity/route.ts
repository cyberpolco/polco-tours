import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { CreateActivityFeeInput, financeService } from '@modules/finance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth('finance_config.read', async (ctx) => {
  const fees = await financeService.listActivityFees(ctx);
  return NextResponse.json({ fees });
});

export const POST = withAuth('finance_config.write', async (ctx, req: NextRequest) => {
  const input = CreateActivityFeeInput.parse(await req.json());
  const fee = await financeService.createActivityFee(ctx, input);
  return NextResponse.json({ fee }, { status: 201 });
});

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { CreateAdminCostRateInput, financeService } from '@modules/finance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth('finance_config.read', async (ctx) => {
  const rates = await financeService.listAdminCostRates(ctx);
  return NextResponse.json({ rates });
});

export const POST = withAuth('finance_config.write', async (ctx, req: NextRequest) => {
  const input = CreateAdminCostRateInput.parse(await req.json());
  const rate = await financeService.createAdminCostRate(ctx, input);
  return NextResponse.json({ rate }, { status: 201 });
});

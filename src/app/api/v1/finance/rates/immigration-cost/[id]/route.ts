import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { CreateImmigrationCostRateInput, financeService } from '@modules/finance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  id: string;
}

export const PATCH = withAuth<Params>('finance_config.write', async (ctx, req: NextRequest, { id }) => {
  const input = CreateImmigrationCostRateInput.parse(await req.json());
  const { rate, reapply } = await financeService.updateImmigrationCostRate(ctx, id, input);
  return NextResponse.json({ rate, reapply });
});

export const DELETE = withAuth<Params>('finance_config.write', async (ctx, _req, { id }) => {
  await financeService.deleteImmigrationCostRate(ctx, id);
  return new NextResponse(null, { status: 204 });
});

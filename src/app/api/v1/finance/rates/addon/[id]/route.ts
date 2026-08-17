import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { CreateAddonRateInput, financeService } from '@modules/finance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  id: string;
}

// No reapply here, unlike every other rate type's PATCH -- an AddonRate is
// resolved live at add-on selection time (src/lib/addon-rates.ts), never
// snapshotted into a cost breakdown, so there's nothing to recompute.
export const PATCH = withAuth<Params>('finance_config.write', async (ctx, req: NextRequest, { id }) => {
  const input = CreateAddonRateInput.parse(await req.json());
  const rate = await financeService.updateAddonRate(ctx, id, input);
  return NextResponse.json({ rate });
});

export const DELETE = withAuth<Params>('finance_config.write', async (ctx, _req, { id }) => {
  await financeService.deleteAddonRate(ctx, id);
  return new NextResponse(null, { status: 204 });
});

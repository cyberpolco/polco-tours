import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { UpdateTaxRateInput, settingsService } from '@modules/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  id: string;
}

// Explicit user request: full replace of country/taxType/rateBp in place --
// same convention as finance/rates' updateXRate routes and coupons' own
// PATCH (DR-136/DR-144). Reapplies every existing package/booking cost
// breakdown (see settingsService.updateTaxRate).
export const PATCH = withAuth<Params>('platform_settings.write', async (ctx, req: NextRequest, { id }) => {
  const input = UpdateTaxRateInput.parse(await req.json());
  const { rate } = await settingsService.updateTaxRate(ctx, id, input);
  return NextResponse.json({ rate });
});

export const DELETE = withAuth<Params>('platform_settings.write', async (ctx, _req, { id }) => {
  await settingsService.deleteTaxRate(ctx, id);
  return new NextResponse(null, { status: 204 });
});

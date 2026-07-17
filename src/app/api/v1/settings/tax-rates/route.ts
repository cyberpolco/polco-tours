import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { CreateTaxRateInput, settingsService } from '@modules/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth('platform_settings.read', async (ctx) => {
  const rates = await settingsService.listTaxRates(ctx);
  return NextResponse.json({ rates });
});

// Passes the route gate for SUPERADMIN/PLATFORM_ADMIN alike (both hold
// '*') -- settingsService.createTaxRate does the extra SUPERADMIN-only
// check that actually excludes PLATFORM_ADMIN (see rbac.ts's
// platform_settings.write comment).
export const POST = withAuth('platform_settings.write', async (ctx, req: NextRequest) => {
  const input = CreateTaxRateInput.parse(await req.json());
  const rate = await settingsService.createTaxRate(ctx, input);
  return NextResponse.json({ rate }, { status: 201 });
});

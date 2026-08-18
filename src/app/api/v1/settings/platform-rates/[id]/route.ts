import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { UpdatePlatformRateInput, settingsService } from '@modules/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  id: string;
}

// Explicit user request: full replace of rateBp in place -- same convention
// as tax-rates' own PATCH above (DR-136/DR-144). Reapplies every existing
// package/booking cost breakdown (see settingsService.updatePlatformRate).
export const PATCH = withAuth<Params>('platform_settings.write', async (ctx, req: NextRequest, { id }) => {
  const input = UpdatePlatformRateInput.parse(await req.json());
  const { rate } = await settingsService.updatePlatformRate(ctx, id, input);
  return NextResponse.json({ rate });
});

export const DELETE = withAuth<Params>('platform_settings.write', async (ctx, _req, { id }) => {
  await settingsService.deletePlatformRate(ctx, id);
  return new NextResponse(null, { status: 204 });
});

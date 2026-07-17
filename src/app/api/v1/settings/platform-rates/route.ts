import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { CreatePlatformRateInput, settingsService } from '@modules/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth('platform_settings.read', async (ctx) => {
  const rates = await settingsService.listPlatformRates(ctx);
  return NextResponse.json({ rates });
});

export const POST = withAuth('platform_settings.write', async (ctx, req: NextRequest) => {
  const input = CreatePlatformRateInput.parse(await req.json());
  const rate = await settingsService.createPlatformRate(ctx, input);
  return NextResponse.json({ rate }, { status: 201 });
});

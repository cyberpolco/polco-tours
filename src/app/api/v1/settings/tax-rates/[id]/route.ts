import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { settingsService } from '@modules/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  id: string;
}

export const DELETE = withAuth<Params>('platform_settings.write', async (ctx, _req, { id }) => {
  await settingsService.deleteTaxRate(ctx, id);
  return new NextResponse(null, { status: 204 });
});

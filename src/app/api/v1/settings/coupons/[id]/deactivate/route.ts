import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { settingsService } from '@modules/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  id: string;
}

// Named /deactivate rather than reusing DELETE (tax-rates'/platform-rates'
// convention) -- this is a soft state change, not a resource deletion
// (CouponRedemption has a real FK to the row, so it's never hard-deleted).
export const POST = withAuth<Params>('platform_settings.write', async (ctx, _req, { id }) => {
  await settingsService.deactivateCoupon(ctx, id);
  return new NextResponse(null, { status: 204 });
});

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { CreateCouponInput, settingsService } from '@modules/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth('platform_settings.read', async (ctx) => {
  const coupons = await settingsService.listCoupons(ctx);
  return NextResponse.json({ coupons });
});

// Passes the route gate for SUPERADMIN/PLATFORM_ADMIN alike (both hold
// '*') -- settingsService.createCoupon does the extra SUPERADMIN-only
// check that actually excludes PLATFORM_ADMIN (see rbac.ts's
// platform_settings.write comment). code is system-generated -- never
// accepted from the request body.
export const POST = withAuth('platform_settings.write', async (ctx, req: NextRequest) => {
  const input = CreateCouponInput.parse(await req.json());
  const coupon = await settingsService.createCoupon(ctx, input);
  return NextResponse.json({ coupon }, { status: 201 });
});

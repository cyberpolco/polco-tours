import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { UpdateCouponInput, settingsService } from '@modules/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  id: string;
}

// DR-144: full replace of discountBp/maxRedemptions/expiresAt (code is
// immutable, no field for it in UpdateCouponInput) -- same convention as
// finance/rates' updateXRate routes.
export const PATCH = withAuth<Params>('platform_settings.write', async (ctx, req: NextRequest, { id }) => {
  const input = UpdateCouponInput.parse(await req.json());
  const coupon = await settingsService.updateCoupon(ctx, id, input);
  return NextResponse.json({ coupon });
});

// DR-144 (explicit user request, replaces the old POST .../deactivate
// route): a genuine hard delete, same DELETE convention as tax-rates'/
// platform-rates' [id] routes above it -- also removes the coupon's
// CouponRedemption history (schema-level cascade, see schema.prisma).
export const DELETE = withAuth<Params>('platform_settings.write', async (ctx, _req, { id }) => {
  await settingsService.deleteCoupon(ctx, id);
  return new NextResponse(null, { status: 204 });
});

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { ApplyCouponInput, invoicingService } from '@modules/invoicing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  invoiceId: string;
}

// Ownership (a tourist may only touch their own booking's invoice) is
// enforced inside invoicingService.applyCoupon/removeCoupon, not here --
// same convention as the sibling /payments route. Gated by
// payment.initiate (not invoice.read) -- applying a coupon decides what
// will be charged, the same class of action as initiating a payment.
export const POST = withAuth<Params>('payment.initiate', async (ctx, req: NextRequest, { invoiceId }) => {
  const { code } = ApplyCouponInput.parse(await req.json());
  const invoice = await invoicingService.applyCoupon(ctx, invoiceId, code);
  return NextResponse.json({ invoice }, { status: 200 });
});

export const DELETE = withAuth<Params>('payment.initiate', async (ctx, _req, { invoiceId }) => {
  const invoice = await invoicingService.removeCoupon(ctx, invoiceId);
  return NextResponse.json({ invoice }, { status: 200 });
});

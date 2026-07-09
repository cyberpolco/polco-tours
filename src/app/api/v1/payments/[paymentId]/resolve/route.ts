import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { ResolvePaymentInput, invoicingService } from '@modules/invoicing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  paymentId: string;
}

// Staff-only (payment.resolve is not granted to TOURIST -- DR-012): stands in
// for a future DPO webhook until OI-01's commercial terms land.
export const POST = withAuth<Params>('payment.resolve', async (ctx, req: NextRequest, { paymentId }) => {
  const { outcome } = ResolvePaymentInput.parse(await req.json());
  const result = await invoicingService.resolvePayment(ctx, paymentId, outcome);
  return NextResponse.json(result);
});

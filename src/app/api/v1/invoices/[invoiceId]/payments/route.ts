import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { InitiatePaymentInput, invoicingService } from '@modules/invoicing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  invoiceId: string;
}

// Ownership (a tourist may only see payments on their own booking's invoice)
// is enforced inside invoicingService.listPayments, not here.
export const GET = withAuth<Params>('invoice.read', async (ctx, _req, { invoiceId }) => {
  const payments = await invoicingService.listPayments(ctx, invoiceId);
  return NextResponse.json({ payments });
});

// DPO is stubbed this increment (OI-01 still open) -- this returns a fake
// redirect and a PENDING payment; a staff-only /resolve action stands in
// for what will become DPO's webhook.
export const POST = withAuth<Params>('payment.initiate', async (ctx, req: NextRequest, { invoiceId }) => {
  const { kind } = InitiatePaymentInput.parse(await req.json());
  const { payment, redirectUrl } = await invoicingService.initiatePayment(ctx, invoiceId, kind);
  return NextResponse.json({ payment, redirectUrl }, { status: 201 });
});

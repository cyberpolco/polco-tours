import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { invoicingService } from '@modules/invoicing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  bookingId: string;
}

// Idempotent get-or-create: an invoice is created lazily on first access,
// not at hold time (DR-012). Ownership (a tourist may only fetch their own
// booking's invoice) is inherited from bookingService.getById.
export const GET = withAuth<Params>('invoice.read', async (ctx, _req, { bookingId }) => {
  const invoice = await invoicingService.getOrCreateInvoiceForBooking(ctx, bookingId);
  return NextResponse.json({ invoice });
});

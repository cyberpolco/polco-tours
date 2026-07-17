import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { SaveCostBreakdownInput, financeService } from '@modules/finance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  packageId: string;
}

export const GET = withAuth<Params>('catalog.write', async (ctx, _req, { packageId }) => {
  const breakdown = await financeService.getCostBreakdown(ctx, packageId);
  return NextResponse.json({ breakdown });
});

// Computes Base Cost -> Selling Price -> per-seat price from the referenced
// rates and pushes it into TourPackage.priceMinor (DR-039) -- or, if
// overridePriceMinor is set, uses that instead and audits the override.
export const PUT = withAuth<Params>('catalog.write', async (ctx, req: NextRequest, { packageId }) => {
  const input = SaveCostBreakdownInput.parse(await req.json());
  const breakdown = await financeService.saveCostBreakdown(ctx, packageId, input);
  return NextResponse.json({ breakdown });
});

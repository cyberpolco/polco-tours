import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { visaService } from '@modules/visa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// VISA_FACILITATOR's own "My Schedule" dashboard (DR-031) -- whole-org
// queue, no country scoping (unlike /immigration/visa-applications). Any
// role holding visa.process (admins too) can reach this.
export const GET = withAuth('visa.process', async (ctx) => {
  const applications = await visaService.listForFacilitator(ctx);
  return NextResponse.json({ applications });
});

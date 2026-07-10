import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { visaService } from '@modules/visa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// IMMIGRATION_OFFICER: forced to their own assignedCountry, ?country= is
// ignored (visaService.listForCountry). Admins may use ?country= to filter
// or omit it to see every country in the org.
export const GET = withAuth('immigration.read', async (ctx, req: NextRequest) => {
  const country = req.nextUrl.searchParams.get('country') ?? undefined;
  const applications = await visaService.listForCountry(ctx, country);
  return NextResponse.json({ applications });
});

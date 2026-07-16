import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { CreateCountryRegulationInput, immigrationService } from '@modules/immigration';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth('country_regulation.read', async (ctx) => {
  const regulations = await immigrationService.listRegulations(ctx);
  return NextResponse.json({ regulations });
});

// Passes the route gate for SUPERADMIN/PLATFORM_ADMIN alike (both hold '*')
// -- immigrationService.createRegulation does the extra SUPERADMIN-only
// check that actually excludes PLATFORM_ADMIN (see rbac.ts's comment on
// country_regulation.write).
export const POST = withAuth('country_regulation.write', async (ctx, req: NextRequest) => {
  const input = CreateCountryRegulationInput.parse(await req.json());
  const regulation = await immigrationService.createRegulation(ctx, input);
  return NextResponse.json({ regulation }, { status: 201 });
});

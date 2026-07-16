import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { UpdateCountryRegulationInput, immigrationService } from '@modules/immigration';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  country: string;
}

export const GET = withAuth<Params>('country_regulation.read', async (ctx, _req, { country }) => {
  const regulation = await immigrationService.getRegulation(ctx, country);
  return NextResponse.json({ regulation });
});

export const PATCH = withAuth<Params>('country_regulation.write', async (ctx, req: NextRequest, { country }) => {
  const input = UpdateCountryRegulationInput.parse(await req.json());
  const regulation = await immigrationService.updateRegulation(ctx, country, input);
  return NextResponse.json({ regulation });
});

export const DELETE = withAuth<Params>('country_regulation.write', async (ctx, _req, { country }) => {
  await immigrationService.deleteRegulation(ctx, country);
  return new NextResponse(null, { status: 204 });
});

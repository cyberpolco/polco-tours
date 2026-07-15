import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { catalogService } from '@modules/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  packageId: string;
}

// Clones the package definition only (title/description/country/price/
// currency/durationDays/tags) as a new DRAFT package with a fresh
// packageReference -- no departures come along (DR-028).
export const POST = withAuth<Params>('catalog.write', async (ctx, _req, { packageId }) => {
  const pkg = await catalogService.duplicatePackage(ctx, packageId);
  return NextResponse.json({ package: pkg }, { status: 201 });
});

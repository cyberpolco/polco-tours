import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { UpdatePackageInput, catalogService } from '@modules/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  packageId: string;
}

export const GET = withAuth<Params>('catalog.read', async (ctx, _req, { packageId }) => {
  const pkg = await catalogService.getPackage(ctx, packageId);
  return NextResponse.json({ package: pkg });
});

export const PATCH = withAuth<Params>('catalog.write', async (ctx, req: NextRequest, { packageId }) => {
  const body = await req.json();
  const input = UpdatePackageInput.parse(body);
  // DR-180: undefined -> leave the package's add-on list untouched (this
  // route's body simply omitted it); an array (including empty) -> replace
  // it with exactly that set. Not part of UpdatePackageInput's own zod
  // schema for the same "spread directly into Prisma" reason as the create route.
  const addonServiceIds = Array.isArray(body.addonServiceIds)
    ? body.addonServiceIds.filter((id: unknown) => typeof id === 'string')
    : undefined;
  const pkg = await catalogService.updatePackage(ctx, packageId, input, addonServiceIds);
  return NextResponse.json({ package: pkg });
});

// Soft delete (DR-028) -- sets deletedAt, hides it from every listing. No
// cascade risk to real Departures/Bookings (unlike a real DB DELETE would be).
export const DELETE = withAuth<Params>('catalog.write', async (ctx, _req, { packageId }) => {
  await catalogService.deletePackage(ctx, packageId);
  return new NextResponse(null, { status: 204 });
});

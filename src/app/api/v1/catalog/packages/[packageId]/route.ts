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
  const input = UpdatePackageInput.parse(await req.json());
  const pkg = await catalogService.updatePackage(ctx, packageId, input);
  return NextResponse.json({ package: pkg });
});

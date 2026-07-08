import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { CreatePackageInput, catalogService } from '@modules/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth('catalog.read', async (ctx) => {
  const packages = await catalogService.listPackages(ctx);
  return NextResponse.json({ packages });
});

export const POST = withAuth('catalog.write', async (ctx, req: NextRequest) => {
  const input = CreatePackageInput.parse(await req.json());
  const pkg = await catalogService.createPackage(ctx, input);
  return NextResponse.json({ package: pkg }, { status: 201 });
});

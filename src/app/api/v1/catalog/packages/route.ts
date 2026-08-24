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
  const body = await req.json();
  const input = CreatePackageInput.parse(body);
  // DR-180: not part of CreatePackageInput's own zod schema -- that object is
  // spread directly into the tourPackage Prisma create call, so an unknown
  // field there would throw. Same separate-parameter treatment as the staff
  // create form's Server Action.
  const addonServiceIds = Array.isArray(body.addonServiceIds) ? body.addonServiceIds.filter((id: unknown) => typeof id === 'string') : [];
  const pkg = await catalogService.createPackage(ctx, input, addonServiceIds);
  return NextResponse.json({ package: pkg }, { status: 201 });
});

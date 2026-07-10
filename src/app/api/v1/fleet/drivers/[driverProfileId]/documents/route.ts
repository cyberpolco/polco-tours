import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { Errors, problemResponse } from '@lib/errors';
import { fleetService } from '@modules/fleet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  driverProfileId: string;
}

export const GET = withAuth<Params>('fleet.read', async (ctx, _req, { driverProfileId }) => {
  const documents = await fleetService.listDriverDocuments(ctx, driverProfileId);
  return NextResponse.json({ documents });
});

export const POST = withAuth<Params>('fleet.write', async (ctx, req: NextRequest, { driverProfileId }) => {
  const formData = await req.formData();

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return problemResponse(Errors.validation('A file is required'));
  }

  const expiresAtRaw = formData.get('expiresAt');
  const expiresAt = typeof expiresAtRaw === 'string' && expiresAtRaw.length > 0 ? new Date(expiresAtRaw) : undefined;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    return problemResponse(Errors.validation('expiresAt must be a valid date'));
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const document = await fleetService.uploadDriverDocument(ctx, driverProfileId, {
    kind: 'DRIVER_LICENSE',
    contentType: file.type,
    sizeBytes: file.size,
    bytes,
    expiresAt,
  });
  return NextResponse.json({ document }, { status: 201 });
});

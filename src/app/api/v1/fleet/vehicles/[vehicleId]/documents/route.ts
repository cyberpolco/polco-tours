import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { Errors, problemResponse } from '@lib/errors';
import { fleetService } from '@modules/fleet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  vehicleId: string;
}

const VEHICLE_DOCUMENT_KINDS = ['VEHICLE_REGISTRATION', 'VEHICLE_INSURANCE', 'VEHICLE_INSPECTION'] as const;

export const GET = withAuth<Params>('fleet.read', async (ctx, _req, { vehicleId }) => {
  const documents = await fleetService.listVehicleDocuments(ctx, vehicleId);
  return NextResponse.json({ documents });
});

export const POST = withAuth<Params>('fleet.write', async (ctx, req: NextRequest, { vehicleId }) => {
  const formData = await req.formData();

  const kind = formData.get('kind');
  if (typeof kind !== 'string' || !VEHICLE_DOCUMENT_KINDS.includes(kind as (typeof VEHICLE_DOCUMENT_KINDS)[number])) {
    return problemResponse(
      Errors.validation(`kind must be one of: ${VEHICLE_DOCUMENT_KINDS.join(', ')}`),
    );
  }

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
  const document = await fleetService.uploadVehicleDocument(ctx, vehicleId, {
    kind: kind as 'VEHICLE_REGISTRATION' | 'VEHICLE_INSURANCE' | 'VEHICLE_INSPECTION',
    contentType: file.type,
    sizeBytes: file.size,
    bytes,
    expiresAt,
  });
  return NextResponse.json({ document }, { status: 201 });
});

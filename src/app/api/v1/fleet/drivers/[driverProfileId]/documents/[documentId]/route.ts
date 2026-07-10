import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { Errors, problemResponse } from '@lib/errors';
import { documentsService } from '@modules/documents';
import { fleetService } from '@modules/fleet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  driverProfileId: string;
  documentId: string;
}

// Same anti-BOLA confirmation as the vehicle documents route: verify the
// document belongs to this driver profile before streaming it.
export const GET = withAuth<Params>('fleet.read', async (ctx, _req, { driverProfileId, documentId }) => {
  const documents = await fleetService.listDriverDocuments(ctx, driverProfileId);
  if (!documents.some((d) => d.id === documentId)) {
    return problemResponse(Errors.notFound('Document not found'));
  }

  const doc = await documentsService.streamDocument(ctx, documentId);
  return new NextResponse(doc.body, {
    headers: {
      'Content-Type': doc.contentType,
      'Content-Length': String(doc.sizeBytes),
      'Cache-Control': 'private, no-store',
    },
  });
});

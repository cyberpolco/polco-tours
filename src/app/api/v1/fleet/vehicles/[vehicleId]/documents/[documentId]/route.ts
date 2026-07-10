import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { Errors, problemResponse } from '@lib/errors';
import { documentsService } from '@modules/documents';
import { fleetService } from '@modules/fleet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  vehicleId: string;
  documentId: string;
}

// Streams the compliance document's bytes server-side -- the underlying
// Vercel Blob pathname never reaches the client (Documents rule, CLAUDE.md).
// Confirms the document actually belongs to this vehicle before streaming
// (documentsService.streamDocument only checks org, not vehicle ownership --
// anti-BOLA, same pattern as the passport route's findTraveler check).
export const GET = withAuth<Params>('fleet.read', async (ctx, _req, { vehicleId, documentId }) => {
  const documents = await fleetService.listVehicleDocuments(ctx, vehicleId);
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

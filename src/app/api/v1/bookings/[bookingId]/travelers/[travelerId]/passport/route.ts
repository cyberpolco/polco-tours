import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { Errors, problemResponse } from '@lib/errors';
import type { AuthContext } from '@modules/auth';
import { bookingService } from '@modules/booking';
import { documentsService } from '@modules/documents';
import { visaService } from '@modules/visa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  bookingId: string;
  travelerId: string;
}

async function findTraveler(ctx: AuthContext, bookingId: string, travelerId: string) {
  const travelers = await bookingService.listTravelers(ctx, bookingId);
  return travelers.find((t) => t.id === travelerId) ?? null;
}

// Streams the passport bytes server-side -- the underlying Vercel Blob
// pathname never reaches the client (Documents rule, CLAUDE.md). Every
// access is audited inside documentsService.streamDocument.
export const GET = withAuth<Params>('documents.read', async (ctx, _req, { bookingId, travelerId }) => {
  const traveler = await findTraveler(ctx, bookingId, travelerId);
  if (!traveler?.passportDocumentId) return problemResponse(Errors.notFound('Passport not found'));

  const doc = await documentsService.streamDocument(ctx, traveler.passportDocumentId);
  return new NextResponse(doc.body, {
    headers: {
      'Content-Type': doc.contentType,
      'Content-Length': String(doc.sizeBytes),
      'Cache-Control': 'private, no-store',
    },
  });
});

export const POST = withAuth<Params>('documents.write', async (ctx, req: NextRequest, { bookingId, travelerId }) => {
  const traveler = await findTraveler(ctx, bookingId, travelerId);
  if (!traveler) return problemResponse(Errors.notFound('Traveler not found'));

  const formData = await req.formData();
  const file = formData.get('passport');
  if (!(file instanceof File) || file.size === 0) {
    return problemResponse(Errors.validation('A PDF file is required'));
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const doc = await documentsService.uploadPassport(ctx, { contentType: file.type, sizeBytes: file.size, bytes });
  await bookingService.setTravelerPassport(ctx, bookingId, travelerId, doc.id);

  // DR-060: best-effort -- never let a visa-application hiccup fail the
  // passport upload response itself.
  try {
    await visaService.autoSubmitOnPassportUpload(ctx, bookingId, travelerId);
  } catch {
    // Falls back to the /staff/visa-queue "Needs application" view.
  }
  return NextResponse.json({ document: doc }, { status: 201 });
});

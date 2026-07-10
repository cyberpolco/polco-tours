import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { Errors, problemResponse } from '@lib/errors';
import { visaService } from '@modules/visa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  bookingId: string;
  travelerId: string;
}

// Streams the granted visa document's bytes server-side -- the underlying
// Vercel Blob pathname never reaches the client (Documents rule, CLAUDE.md).
// Every access is audited inside documentsService.streamDocument.
export const GET = withAuth<Params>('documents.read', async (ctx, _req, { bookingId, travelerId }) => {
  const doc = await visaService.streamDocument(ctx, bookingId, travelerId);
  return new NextResponse(doc.body, {
    headers: {
      'Content-Type': doc.contentType,
      'Content-Length': String(doc.sizeBytes),
      'Cache-Control': 'private, no-store',
    },
  });
});

export const POST = withAuth<Params>('visa.process', async (ctx, req: NextRequest, { bookingId, travelerId }) => {
  const file = (await req.formData()).get('file');
  if (!(file instanceof File) || file.size === 0) {
    return problemResponse(Errors.validation('A file is required'));
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const document = await visaService.uploadDocument(ctx, bookingId, travelerId, {
    contentType: file.type,
    sizeBytes: file.size,
    bytes,
  });
  return NextResponse.json({ document }, { status: 201 });
});

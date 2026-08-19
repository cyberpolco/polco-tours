import { NextRequest, NextResponse } from 'next/server';
import { ApiError, Errors, problemResponse } from '@lib/errors';
import { logger, newTraceId } from '@lib/logger';
import { authService } from '@modules/auth';
import { visaService } from '@modules/visa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  bookingId: string;
  travelerId: string;
}

// DR-154: guest-only counterpart to the staff-only GET at
// .../visa/document/route.ts -- that route is gated by withAuth('documents.read'),
// a permission TOURIST never holds, so this is a small hand-written sibling
// that resolves the session directly (same actor-resolution/error-translation
// shape withAuth itself uses, minus the permission assertion) and delegates
// ownership + streaming entirely to visaService.streamDocumentForGuest, which
// 404s unless this exact ctx is the booking's own tour lead and the
// application is APPROVED with a document attached.
export async function GET(req: NextRequest, routeCtx: { params: Promise<Params> }): Promise<NextResponse> {
  const traceId = req.headers.get('x-trace-id') ?? newTraceId();
  try {
    const ctx = await authService.resolveSession(req.headers);
    const { bookingId, travelerId } = await routeCtx.params;

    const doc = await visaService.streamDocumentForGuest(ctx, bookingId, travelerId);
    return new NextResponse(doc.body, {
      headers: {
        'Content-Type': doc.contentType,
        'Content-Length': String(doc.sizeBytes),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    if (err instanceof ApiError) return problemResponse(err, { traceId });
    logger(traceId).error('unhandled route error', {
      message: err instanceof Error ? err.message : String(err),
    });
    return problemResponse(Errors.internal(), { traceId });
  }
}

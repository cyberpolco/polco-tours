import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { itineraryService } from '@modules/itinerary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  itineraryId: string;
}

// DR-150: whole-circuit map PDF, replacing the old per-day map-pdf route.
// Thin pass-through, same convention as summary-pdf's route -- all business
// logic lives in itineraryService.streamItineraryMapPdf.
export const GET = withAuth<Params>('itinerary.read', async (ctx, _req, { itineraryId }) => {
  const pdf = await itineraryService.streamItineraryMapPdf(ctx, itineraryId);
  return new NextResponse(pdf.body, {
    headers: {
      'Content-Type': pdf.contentType,
      'Content-Disposition': `attachment; filename="${pdf.filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});

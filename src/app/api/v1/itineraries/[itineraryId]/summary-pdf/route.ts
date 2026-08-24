import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { itineraryService } from '@modules/itinerary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  itineraryId: string;
}

// Thin pass-through, same convention as the day map-pdf route -- all
// business logic (the APPROVED-only gate, day/hotel/restaurant/site/
// activity resolution, PDF rendering) lives in
// itineraryService.streamItinerarySummaryPdf.
export const GET = withAuth<Params>('itinerary.read', async (ctx, _req, { itineraryId }) => {
  const pdf = await itineraryService.streamItinerarySummaryPdf(ctx, itineraryId);
  return new NextResponse(pdf.body, {
    headers: {
      'Content-Type': pdf.contentType,
      'Content-Disposition': `attachment; filename="${pdf.filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});

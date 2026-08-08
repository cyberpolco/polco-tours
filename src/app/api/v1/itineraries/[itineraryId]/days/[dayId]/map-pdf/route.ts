import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { itineraryService } from '@modules/itinerary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  itineraryId: string;
  dayId: string;
}

// itineraryId is part of the URL for consistency with the existing
// itineraries/[itineraryId]/days/[dayId] route shape, but isn't needed by
// the handler -- streamDayMapPdf resolves + re-checks ownership from dayId
// alone, the same anti-BOLA scoping resolveMapOverview uses. All business
// logic lives in that one service method; this route is a thin pass-through,
// same convention as the passport streaming route.
export const GET = withAuth<Params>('itinerary.read', async (ctx, _req, { dayId }) => {
  const pdf = await itineraryService.streamDayMapPdf(ctx, dayId);
  return new NextResponse(pdf.body, {
    headers: {
      'Content-Type': pdf.contentType,
      'Content-Disposition': 'attachment; filename="itinerary-day-map.pdf"',
      'Cache-Control': 'private, no-store',
    },
  });
});

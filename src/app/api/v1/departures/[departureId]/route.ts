import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { catalogService } from '@modules/catalog';
import { bookingService } from '@modules/booking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  departureId: string;
}

export const GET = withAuth<Params>('catalog.read', async (ctx, _req, { departureId }) => {
  const [detail, availability] = await Promise.all([
    catalogService.getDepartureDetail(ctx, departureId),
    bookingService.getAvailability(ctx, departureId),
  ]);
  return NextResponse.json({
    departure: detail.departure,
    packageStatus: detail.packageStatus,
    packageCountry: detail.packageCountry,
    effectiveUnitPrice: detail.effectiveUnitPrice,
    bookable: detail.bookable,
    seatsAvailable: availability.seatsAvailable,
  });
});

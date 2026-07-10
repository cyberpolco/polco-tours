import { notFound } from 'next/navigation';
import { catalogService } from '@modules/catalog';
import { format } from '@lib/money';
import BookingForm from './booking-form';

interface Props {
  params: Promise<{ departureId: string }>;
  searchParams: Promise<{ error?: string }>;
}

export default async function BookDeparturePage({ params, searchParams }: Props) {
  const { departureId } = await params;
  const { error } = await searchParams;

  let detail;
  try {
    detail = await catalogService.getPublicDepartureDetail(departureId);
  } catch {
    notFound();
  }
  if (!detail.bookable) notFound();

  return (
    <div className="max-w-md">
      <p className="text-xs tracking-survey text-mist">NEW BOOKING</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">
        {detail.departure.startDate.toLocaleDateString()} · {format(detail.effectiveUnitPrice)}/seat
      </h1>

      {error === 'session' && (
        <p className="mt-3 text-sm text-amber">Something interrupted starting your booking -- please try again.</p>
      )}
      {error === 'sold_out' && (
        <p className="mt-3 text-sm text-amber">This departure just sold out -- try a different date.</p>
      )}

      <BookingForm departureId={departureId} capacity={detail.departure.capacity} />
    </div>
  );
}

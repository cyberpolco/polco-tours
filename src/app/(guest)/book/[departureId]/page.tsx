import { notFound } from 'next/navigation';
import { catalogService } from '@modules/catalog';
import { format } from '@lib/money';
import BookingForm from './booking-form';

interface Props {
  params: Promise<{ departureId: string }>;
}

export default async function BookDeparturePage({ params }: Props) {
  const { departureId } = await params;

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

      <BookingForm departureId={departureId} capacity={detail.departure.capacity} />
    </div>
  );
}

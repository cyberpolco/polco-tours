import { notFound } from 'next/navigation';
import { catalogService } from '@modules/catalog';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { BOOKING_WIZARD_STEPS } from '../../booking-wizard-steps';
import { formatOrPending } from '@lib/money';
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
      <StepIndicator steps={BOOKING_WIZARD_STEPS} currentIndex={0} />
      <p className="eyebrow mt-4 text-mist">New booking</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">
        {detail.departure.startDate.toLocaleDateString()} ·{' '}
        {formatOrPending(detail.effectiveUnitPrice?.minor ?? null, detail.effectiveUnitPrice?.currency ?? null)}/seat
      </h1>

      <BookingForm departureId={departureId} capacity={detail.departure.capacity} />
    </div>
  );
}

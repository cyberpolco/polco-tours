import Link from 'next/link';
import { notFound } from 'next/navigation';
import { catalogService } from '@modules/catalog';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { getBookingWizardSteps } from '../../booking-wizard-steps';
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
      {detail.departure.tourPackageId && (
        <Link href={`/packages/${detail.departure.tourPackageId}`} className="text-sm text-forest hover:underline">
          ← back to package
        </Link>
      )}
      <StepIndicator steps={getBookingWizardSteps(false)} currentIndex={0} />
      <p className="eyebrow mt-4 text-mist">New booking</p>
      {/* Departure dates are staff-only information (visible in the staff
          dashboard) -- only the price is shown here. */}
      <h1 className="mt-1 text-2xl font-bold text-navy">
        {formatOrPending(detail.effectiveUnitPrice?.minor ?? null, detail.effectiveUnitPrice?.currency ?? null)}/seat
      </h1>

      <BookingForm departureId={departureId} capacity={detail.departure.capacity} />
    </div>
  );
}

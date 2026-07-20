import Link from 'next/link';
import { notFound } from 'next/navigation';
import { catalogService } from '@modules/catalog';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { getBookingWizardSteps } from '../../booking-wizard-steps';
import { formatOrPending } from '@lib/money';
import BookingForm from './booking-form';

interface Props {
  params: Promise<{ packageId: string }>;
}

// DR-054: replaces /book/[departureId] as the guest entry point for a
// PREDEFINED_PACKAGE booking -- there's no pre-existing Departure to pick
// here at all, the guest's own chosen dates (collected in BookingForm) are
// what create one (catalogService.createDepartureForBooking, via
// bookingService.createHoldWithDates). /book/[departureId] itself is left
// unchanged for any real, staff-pre-scheduled Departure a direct link might
// still point at -- this route is additive, not a replacement of that one.
export default async function BookPackagePage({ params }: Props) {
  const { packageId } = await params;

  let pkg;
  try {
    ({ pkg } = await catalogService.getPublicPackageWithDepartures(packageId));
  } catch {
    notFound();
  }
  if (pkg.status !== 'PUBLISHED' || pkg.priceMinor == null) notFound();

  return (
    <div className="max-w-md">
      <Link href={`/packages/${packageId}`} className="text-sm text-forest hover:underline">
        ← back to package
      </Link>
      <StepIndicator steps={getBookingWizardSteps(false)} currentIndex={0} />
      <p className="eyebrow mt-4 text-mist">New booking</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">{formatOrPending(pkg.priceMinor, pkg.currency)}/seat</h1>

      <BookingForm packageId={packageId} />
    </div>
  );
}

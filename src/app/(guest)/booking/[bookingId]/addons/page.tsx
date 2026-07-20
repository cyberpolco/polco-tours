import Link from 'next/link';
import { requireGuestContext } from '@lib/guest-guard';
import { format, money } from '@lib/money';
import { bookingService } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { getBookingWizardSteps } from '../../../booking-wizard-steps';
import { finalizeAddonsAction } from './actions';

interface Props {
  params: Promise<{ bookingId: string }>;
}

// Add-ons is now the FIRST setup step (right after the booking/hold itself
// exists) -- whether Visa Assistance is picked here decides if a later
// Passport step appears at all, and for how many travelers (see
// bookingService.setAddons / Booking.requiresPassportUpload). Revisiting
// after it's already been finalized once (e.g. via the Travelers step's
// "back" link) re-opens it for editing instead of bouncing forward again --
// setAddons is a replace-all, so resubmitting is always safe.
export default async function AddonsPage({ params }: Props) {
  const { bookingId } = await params;
  const ctx = await requireGuestContext();
  const booking = await bookingService.getById(ctx, bookingId);

  // A TAILOR_MADE booking has no price until staff sends a quotation --
  // add-ons can't be currency-matched against it yet (setAddons enforces
  // this server-side too). In practice unreachable once a quotation has
  // been accepted (the only way to reach this wizard at all), kept as a
  // defensive fallback rather than a routine path.
  if (!booking.currency) {
    return (
      <div className="max-w-md">
        <Link href={`/booking/${bookingId}`} className="text-sm text-forest hover:underline">
          ← back to your booking
        </Link>
        <StepIndicator steps={getBookingWizardSteps(false)} currentIndex={1} />
        <p className="eyebrow mt-4 text-mist">Booking setup · Add-ons</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">Waiting on your quotation</h1>
        <p className="mt-1 text-sm text-mist">
          Add-ons open up once our team sends a price for your trip -- we&apos;ll notify you.
        </p>
      </div>
    );
  }

  const [addons, selected] = await Promise.all([
    catalogService.listActiveAddonServices(ctx),
    booking.addonsFinalizedAt ? bookingService.listAddons(ctx, bookingId) : Promise.resolve([]),
  ]);
  const selectedIds = new Set(selected.map((a) => a.addonServiceId));

  return (
    <div className="max-w-md">
      <Link href={`/booking/${bookingId}`} className="text-sm text-forest hover:underline">
        ← back to your booking
      </Link>
      <StepIndicator steps={getBookingWizardSteps(booking.requiresPassportUpload)} currentIndex={1} />
      <p className="eyebrow mt-4 text-mist">Booking setup · Add-ons</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">Optional add-on services</h1>
      <p className="mt-1 text-sm text-mist">Selecting none is fine -- just finish setup to continue.</p>

      <form action={finalizeAddonsAction.bind(null, bookingId)} className="mt-6 space-y-3">
        {addons.length === 0 ? (
          <p className="text-sm text-mist">No add-on services configured.</p>
        ) : (
          addons.map((a) => (
            <SelectableCard
              key={a.id}
              type="checkbox"
              name="addonServiceId"
              value={a.id}
              defaultChecked={selectedIds.has(a.id)}
            >
              <span className="flex flex-1 items-center justify-between">
                <span>{a.name}</span>
                <span className="text-mist">{format(money(a.priceMinor, a.currency))}</span>
              </span>
            </SelectableCard>
          ))
        )}
        <SubmitButton>{booking.addonsFinalizedAt ? 'Save changes' : 'Finish setup'}</SubmitButton>
      </form>
    </div>
  );
}

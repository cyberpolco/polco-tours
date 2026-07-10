import { redirect } from 'next/navigation';
import { requireGuestContext } from '@lib/guest-guard';
import { format, money } from '@lib/money';
import { bookingService } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { BOOKING_WIZARD_STEPS } from '../../../booking-wizard-steps';
import { finalizeAddonsAction } from './actions';

interface Props {
  params: Promise<{ bookingId: string }>;
}

export default async function AddonsPage({ params }: Props) {
  const { bookingId } = await params;
  const ctx = await requireGuestContext();
  const [booking, travelers] = await Promise.all([
    bookingService.getById(ctx, bookingId),
    bookingService.listTravelers(ctx, bookingId),
  ]);

  const lead = travelers.find((t) => t.isTourLead);
  if (travelers.length < booking.seats || !lead?.passportDocumentId) {
    redirect(`/booking/${bookingId}/travelers/new`);
  }
  if (booking.addonsFinalizedAt) {
    redirect(`/booking/${bookingId}`);
  }

  const addons = await catalogService.listActiveAddonServices(ctx);

  return (
    <div className="max-w-md">
      <StepIndicator steps={BOOKING_WIZARD_STEPS} currentIndex={3} />
      <p className="eyebrow mt-4 text-mist">Booking setup · Add-ons</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">Optional add-on services</h1>
      <p className="mt-1 text-sm text-mist">Selecting none is fine -- just finish setup to continue.</p>

      <form action={finalizeAddonsAction.bind(null, bookingId)} className="mt-6 space-y-3">
        {addons.length === 0 ? (
          <p className="text-sm text-mist">No add-on services configured.</p>
        ) : (
          addons.map((a) => (
            <SelectableCard key={a.id} type="checkbox" name="addonServiceId" value={a.id}>
              <span className="flex flex-1 items-center justify-between">
                <span>{a.name}</span>
                <span className="text-mist">{format(money(a.priceMinor, a.currency))}</span>
              </span>
            </SelectableCard>
          ))
        )}
        <SubmitButton>Finish setup</SubmitButton>
      </form>
    </div>
  );
}

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { format, money } from '@lib/money';
import { bookingService } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { PageHeader } from '@/components/ui/PageHeader';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { finalizeAddonsAction } from './actions';

interface Props {
  params: Promise<{ bookingId: string }>;
}

// Add-ons is now the FIRST setup step (right after the booking exists) --
// whether Visa Assistance is picked here decides if a later Passport step
// appears at all, and for how many travelers (see bookingService.setAddons
// / Booking.requiresPassportUpload).
export default async function AddonsPage({ params }: Props) {
  const { bookingId } = await params;
  const ctx = await requireStaffContext('booking.create');
  const booking = await bookingService.getById(ctx, bookingId);

  if (booking.addonsFinalizedAt) {
    redirect(`/staff/bookings/${bookingId}/travelers/new`);
  }

  // A TAILOR_MADE booking has no price until a quotation is sent -- add-ons
  // can't be currency-matched against it yet (setAddons enforces this
  // server-side too).
  if (!booking.currency) {
    return (
      <div className="max-w-md">
        <PageHeader eyebrow="Booking setup · Add-ons" title="Waiting on a quotation" />
        <p className="mt-1 text-sm text-mist">Send a quotation for this booking before selecting add-ons.</p>
      </div>
    );
  }

  const addons = await catalogService.listActiveAddonServices(ctx);

  return (
    <div className="max-w-md">
      <PageHeader eyebrow="Booking setup · Add-ons" title="Optional add-on services" />
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

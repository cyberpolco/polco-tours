import { requireStaffContext } from '@lib/staff-guard';
import { format, money } from '@lib/money';
import { bookingService } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { Alert } from '@/components/ui/Alert';
import { BackLink } from '@/components/ui/BackLink';
import { PageHeader } from '@/components/ui/PageHeader';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { finalizeAddonsAction } from './actions';

interface Props {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{ error?: string }>;
}

// Add-ons is now the FIRST setup step (right after the booking exists) --
// whether Visa Assistance is picked here decides if a later Passport step
// appears at all, and for how many travelers (see bookingService.setAddons
// / Booking.requiresPassportUpload). Revisiting after it's already been
// finalized once (e.g. via the Travelers step's "back" link) re-opens it
// for editing instead of bouncing forward again -- setAddons is a
// replace-all, so resubmitting is always safe.
export default async function AddonsPage({ params, searchParams }: Props) {
  const { bookingId } = await params;
  const { error } = await searchParams;
  const ctx = await requireStaffContext('booking.create');
  const booking = await bookingService.getById(ctx, bookingId);

  // A TAILOR_MADE booking has no price until a quotation is sent -- add-ons
  // can't be currency-matched against it yet (setAddons enforces this
  // server-side too).
  if (!booking.currency) {
    return (
      <div className="max-w-md">
        <BackLink href={`/staff/bookings/${bookingId}`}>back to booking</BackLink>
        <PageHeader eyebrow="Booking setup · Add-ons" title="Waiting on a quotation" />
        <p className="mt-1 text-sm text-mist">Send a quotation for this booking before selecting add-ons.</p>
      </div>
    );
  }

  const [allAddons, selected] = await Promise.all([
    catalogService.listActiveAddonServices(ctx),
    booking.addonsFinalizedAt ? bookingService.listAddons(ctx, bookingId) : Promise.resolve([]),
  ]);
  // This app has no FX conversion anywhere (BR-02) -- an add-on priced in a
  // different currency than the booking can never actually be selected
  // (setAddons rejects the mismatch server-side too). Filter here so staff
  // never see an option that would fail on submit -- found live in
  // production: the seeded add-on catalog is USD-only, but several demo
  // packages are priced in NAD, so every add-on silently failed for those
  // bookings until this filter existed.
  const addons = allAddons.filter((a) => a.currency === booking.currency);
  const selectedIds = new Set(selected.map((a) => a.addonServiceId));

  return (
    <div className="max-w-md">
      <BackLink href={`/staff/bookings/${bookingId}`}>back to booking</BackLink>
      <PageHeader eyebrow="Booking setup · Add-ons" title="Optional add-on services" />
      <p className="mt-1 text-sm text-mist">Selecting none is fine -- continue to add traveler details next.</p>
      {error && (
        <div className="mt-3">
          <Alert tone="error">Something went wrong saving add-ons -- please try again.</Alert>
        </div>
      )}

      <form action={finalizeAddonsAction.bind(null, bookingId)} className="mt-6 space-y-3">
        {addons.length === 0 ? (
          <p className="text-sm text-mist">
            {allAddons.length === 0
              ? 'No add-on services configured.'
              : `No add-on services are currently available in ${booking.currency}.`}
          </p>
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
        <SubmitButton>{booking.addonsFinalizedAt ? 'Save changes' : 'Continue'}</SubmitButton>
      </form>
    </div>
  );
}

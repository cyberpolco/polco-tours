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

// Matches (guest)/plan-my-trip/plan-my-trip-form.tsx's own titleCase/
// addonLabel -- AddonCode values are two-word SCREAMING_CASE (e.g.
// "VISA_ASSISTANCE"), hand-copied per-file like the other staff pages that
// render this enum (see [bookingId]/page.tsx's own copy).
function titleCase(tag: string): string {
  return tag.charAt(0) + tag.slice(1).toLowerCase();
}
function addonLabel(code: string): string {
  return code
    .split('_')
    .map(titleCase)
    .join(' ');
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

  const [allAddons, selected] = await Promise.all([
    catalogService.listActiveAddonServices(ctx),
    booking.addonsFinalizedAt ? bookingService.listAddons(ctx, bookingId) : Promise.resolve([]),
  ]);
  // This app has no FX conversion anywhere (BR-02) -- an add-on priced in a
  // different currency than the booking can never actually be selected once
  // the booking has a fixed currency (setAddons rejects the mismatch
  // server-side too). Filter here so staff never see an option that would
  // fail on submit -- found live in production: the seeded add-on catalog is
  // USD-only, but several demo packages are priced in NAD, so every add-on
  // silently failed for those bookings until this filter existed. Before a
  // quotation exists (booking.currency still null, e.g. a fresh TAILOR_MADE
  // request), there's nothing to filter against yet -- show every active
  // add-on instead (each price is already currency-labelled by `format`);
  // setAddons's own internal-consistency check catches a mixed selection.
  const addons = booking.currency ? allAddons.filter((a) => a.currency === booking.currency) : allAddons;
  const selectedIds = new Set(selected.map((a) => a.addonServiceId));
  // Guest-declared interest (plan-my-trip step 7, DR-048) -- pre-check the
  // matching priced service and flag it below so staff aren't re-asking a
  // question the guest already answered. Only before the first finalize:
  // once real add-ons are on file, defer entirely to that actual selection.
  const requestedCodes = new Set(booking.origin === 'TAILOR_MADE' ? booking.preferredAddons : []);

  return (
    <div className="max-w-md">
      <BackLink href={`/staff/bookings/${bookingId}`}>back to booking</BackLink>
      <PageHeader eyebrow="Booking setup · Add-ons" title="Optional add-on services" />
      <p className="mt-1 text-sm text-mist">Selecting none is fine -- continue to add traveler details next.</p>
      {requestedCodes.size > 0 && (
        <p className="mt-1 text-sm text-mist">
          Guest requested on their plan-my-trip request: {[...requestedCodes].map(addonLabel).join(', ')} -- matching
          services below are pre-checked.
        </p>
      )}
      {!booking.currency && (
        <p className="mt-1 text-sm text-mist">
          This booking has no price yet -- add-ons picked here must share one currency; use the cost breakdown to price
          the rest before sending a quotation.
        </p>
      )}
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
              defaultChecked={booking.addonsFinalizedAt ? selectedIds.has(a.id) : selectedIds.has(a.id) || requestedCodes.has(a.code)}
            >
              <span className="flex flex-1 items-center justify-between">
                <span>
                  {a.name}
                  {!booking.addonsFinalizedAt && requestedCodes.has(a.code) && (
                    <span className="ml-2 text-xs uppercase tracking-wide text-forest">Guest requested</span>
                  )}
                </span>
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

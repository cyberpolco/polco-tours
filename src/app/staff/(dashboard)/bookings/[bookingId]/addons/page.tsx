import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { format, money } from '@lib/money';
import { getEffectiveAddonRate } from '@lib/addon-rates';
import { bookingService, isBookingLocked } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { Alert } from '@/components/ui/Alert';
import { BackLink } from '@/components/ui/BackLink';
import { PageHeader } from '@/components/ui/PageHeader';
import { Reveal, RevealGroup } from '@/components/ui/Reveal';
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
  const t = await getTranslations('StaffAddonsPage');
  const tAddons = await getTranslations('TripAddons');
  const tBookingStatus = await getTranslations('BookingStatusLabel');

  if (isBookingLocked(booking.status)) {
    return (
      <div className="max-w-md">
        <BackLink href={`/staff/bookings/${bookingId}`}>{t('backToBooking')}</BackLink>
        <PageHeader eyebrow={t('setupAddons')} title={t('optionalAddons')} />
        <div className="mt-6">
          <Alert tone="info">{t('bookingLocked', { status: tBookingStatus(booking.status) })}</Alert>
        </div>
      </div>
    );
  }

  const [allAddons, selected, country] = await Promise.all([
    catalogService.listActiveAddonServices(ctx),
    booking.addonsFinalizedAt ? bookingService.listAddons(ctx, bookingId) : Promise.resolve([]),
    bookingService.getBookingCountry(ctx, bookingId),
  ]);
  // DR-128: each add-on's real, chargeable price comes from AddonRate
  // (country + code, resolved by src/lib/addon-rates.ts) -- AddonService's
  // own flat priceMinor/currency is no longer used for pricing. An add-on
  // with no rate configured for this booking's country is simply not
  // offered here.
  const withResolvedRates = await Promise.all(
    allAddons.map(async (a) => {
      const rate = await getEffectiveAddonRate(country, a.code);
      return rate ? { ...a, priceMinor: rate.priceMinor, currency: rate.currency } : null;
    }),
  );
  const countryPricedAddons = withResolvedRates.filter((a): a is NonNullable<typeof a> => a !== null);
  // This app has no FX conversion anywhere (BR-02) -- an add-on priced in a
  // different currency than the booking can never actually be selected once
  // the booking has a fixed currency (setAddons rejects the mismatch
  // server-side too). Filter here so staff never see an option that would
  // fail on submit -- found live in production: the seeded add-on catalog is
  // USD-only, but several demo packages are priced in NAD, so every add-on
  // silently failed for those bookings until this filter existed. Before a
  // quotation exists (booking.currency still null, e.g. a fresh TAILOR_MADE
  // request), there's nothing to filter against yet -- show every country-
  // priced add-on instead (each price is already currency-labelled by
  // `format`); setAddons's own internal-consistency check catches a mixed
  // selection.
  const addons = booking.currency ? countryPricedAddons.filter((a) => a.currency === booking.currency) : countryPricedAddons;
  const selectedIds = new Set(selected.map((a) => a.addonServiceId));
  // Guest-declared interest (plan-my-trip step 7, DR-048) -- pre-check the
  // matching priced service and flag it below so staff aren't re-asking a
  // question the guest already answered. Only before the first finalize:
  // once real add-ons are on file, defer entirely to that actual selection.
  const requestedCodes = new Set(booking.origin === 'TAILOR_MADE' ? booking.preferredAddons : []);

  return (
    <div className="max-w-md">
      <BackLink href={`/staff/bookings/${bookingId}`}>{t('backToBooking')}</BackLink>
      <PageHeader eyebrow={t('setupAddons')} title={t('optionalAddons')} />
      <p className="mt-1 text-sm text-mist">{t('selectingNoneFine')}</p>
      {requestedCodes.size > 0 && (
        <p className="mt-1 text-sm text-mist">
          {t('guestRequestedNotice', { list: [...requestedCodes].map((code) => tAddons(code)).join(', ') })}
        </p>
      )}
      {!booking.currency && <p className="mt-1 text-sm text-mist">{t('noPriceYetNotice')}</p>}
      {error && (
        <div className="mt-3">
          <Alert tone="error">{t('saveError')}</Alert>
        </div>
      )}

      <Reveal>
        <form action={finalizeAddonsAction.bind(null, bookingId)} className="mt-6 space-y-3">
          {addons.length === 0 ? (
            <p className="text-sm text-mist">
              {countryPricedAddons.length === 0 ? t('noAddonsConfigured') : t('noAddonsInCurrency', { currency: booking.currency ?? '' })}
            </p>
          ) : (
            <RevealGroup as="div" itemAs="div" className="space-y-3">
              {addons.map((a) => (
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
                        <span className="ml-2 text-xs uppercase tracking-wide text-forest">{t('guestRequestedBadge')}</span>
                      )}
                    </span>
                    <span className="text-mist">{format(money(a.priceMinor, a.currency))}</span>
                  </span>
                </SelectableCard>
              ))}
            </RevealGroup>
          )}
          <SubmitButton>{booking.addonsFinalizedAt ? t('saveChanges') : t('continueLabel')}</SubmitButton>
        </form>
      </Reveal>
    </div>
  );
}

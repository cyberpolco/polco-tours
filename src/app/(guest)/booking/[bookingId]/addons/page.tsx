import { getTranslations } from 'next-intl/server';
import { requireGuestContext } from '@lib/guest-guard';
import { getEffectiveAddonRate } from '@lib/addon-rates';
import { bookingService } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { immigrationService } from '@modules/immigration';
import { Alert } from '@/components/ui/Alert';
import { BackLink } from '@/components/ui/BackLink';
import { Reveal } from '@/components/ui/Reveal';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { getBookingWizardSteps } from '../../../booking-wizard-steps';
import { AddonsForm } from './addons-form';

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
  const t = await getTranslations('AddonsPage');

  // A TAILOR_MADE booking has no price until staff sends a quotation --
  // add-ons can't be currency-matched against it yet (setAddons enforces
  // this server-side too). In practice unreachable once a quotation has
  // been accepted (the only way to reach this wizard at all), kept as a
  // defensive fallback rather than a routine path.
  if (!booking.currency) {
    return (
      <Reveal>
        <div className="max-w-md">
          <BackLink href={`/booking/${bookingId}`}>{t('backToBooking')}</BackLink>
          <StepIndicator steps={await getBookingWizardSteps(false)} currentIndex={1} variant="checklist" />
          <p className="eyebrow mt-4 text-mist">{t('setupAddons')}</p>
          <h1 className="mt-1 text-2xl font-bold text-navy">{t('waitingOnQuotation')}</h1>
          <div className="mt-3">
            <Alert tone="info">{t('addonsOpenNotice')}</Alert>
          </div>
        </div>
      </Reveal>
    );
  }

  const [packageId, selected, country] = await Promise.all([
    bookingService.getBookingPackageId(ctx, bookingId),
    booking.addonsFinalizedAt ? bookingService.listAddons(ctx, bookingId) : Promise.resolve([]),
    bookingService.getBookingCountry(ctx, bookingId),
  ]);
  // DR-180: a package curates its own add-on list; a TAILOR_MADE request
  // pre-quote has no package yet (packageId null), so it falls back to the
  // org-wide list -- today's behavior, unaffected by this change.
  const allAddons = packageId
    ? await catalogService.listAddonServicesForPackage(ctx, packageId)
    : await catalogService.listActiveAddonServices(ctx);
  // DR-128: each add-on's real, chargeable price comes from AddonRate
  // (country + code, resolved by src/lib/addon-rates.ts) -- AddonService's
  // own flat priceMinor/currency is no longer used for pricing. An add-on
  // with no rate configured for this booking's country is simply not
  // offered here, same "hide, never fall back to a hand-typed price"
  // posture as every other Operational Rate.
  const withResolvedRates = await Promise.all(
    allAddons.map(async (a) => {
      const rate = await getEffectiveAddonRate(country, a.code);
      return rate ? { ...a, priceMinor: rate.priceMinor, currency: rate.currency } : null;
    }),
  );
  const countryPricedAddons = withResolvedRates.filter((a): a is NonNullable<typeof a> => a !== null);
  // This app has no FX conversion anywhere (BR-02) -- an add-on priced in a
  // different currency than the booking can never actually be selected
  // (setAddons rejects the mismatch server-side too). Filter here so the
  // guest never sees an option that would fail on submit -- found live in
  // production: the seeded add-on catalog is USD-only, but several demo
  // packages are priced in NAD, so every add-on silently failed for those
  // bookings until this filter existed.
  const addons = countryPricedAddons.filter((a) => a.currency === booking.currency);
  const selectedIds = new Set(selected.map((a) => a.addonServiceId));
  // DR-184: the destination country's own government/immigration fee --
  // distinct from the VISA_ASSISTANCE add-on's own price above. Fetched
  // unconditionally (no-ctx, cheap) rather than gating on whether that
  // add-on is actually offered here, since AddonsForm only renders the
  // disclaimer next to that specific add-on anyway.
  const governmentFee = await immigrationService.getPublicFee(country);

  return (
    <Reveal>
      <div className="max-w-md">
        <BackLink href={`/booking/${bookingId}`}>{t('backToBooking')}</BackLink>
        <StepIndicator steps={await getBookingWizardSteps(booking.requiresPassportUpload)} currentIndex={1} variant="checklist" />
        <p className="eyebrow mt-4 text-mist">{t('setupAddons')}</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">{t('optionalAddons')}</h1>
        <p className="mt-1 text-sm text-mist">{t('selectingNoneFine')}</p>

        <AddonsForm
          bookingId={bookingId}
          addons={addons.map((a) => ({ id: a.id, name: a.name, priceMinor: a.priceMinor, currency: a.currency, code: a.code }))}
          selectedIds={[...selectedIds]}
          alreadyFinalized={Boolean(booking.addonsFinalizedAt)}
          emptyMessage={countryPricedAddons.length === 0 ? t('noAddonsConfigured') : t('noAddonsInCurrency', { currency: booking.currency })}
          governmentFeeMinor={governmentFee.governmentFeeMinor}
          governmentFeeCurrency={governmentFee.feeCurrency}
        />
      </div>
    </Reveal>
  );
}

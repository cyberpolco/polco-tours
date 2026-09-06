import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { AirportView } from '@modules/finance';
import { requireGuestContext } from '@lib/guest-guard';
import { getEffectiveAddonRate } from '@lib/addon-rates';
import { bookingService } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { financeService } from '@modules/finance';
import { immigrationService } from '@modules/immigration';
import { Alert } from '@/components/ui/Alert';
import { BackLink } from '@/components/ui/BackLink';
import { Reveal } from '@/components/ui/Reveal';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { getBookingWizardSteps } from '../../../booking-wizard-steps';
import { AddonsForm } from './addons-form';

// Real per-guest data, not a link-share target -- kept out of search
// indexing (defense-in-depth on data already gated by requireGuestContext/
// lookup credentials, not a security fix by itself). No dynamic title/
// description/OG image work spent on this page for the same reason.
export const metadata: Metadata = { robots: { index: false, follow: false } };

interface Props {
  params: Promise<{ bookingId: string }>;
}

// DR-222: FLIGHT_TICKET/ESIM are priced by a guest-picked variant
// combination (route+airline+class / data-plan tier) instead of a flat
// per-country AddonRate -- getEffectiveAddonRate always returns null for
// them, so they're pulled out of the flat-priced list entirely rather than
// silently vanishing behind that lookup.
const VARIANT_CODES = new Set(['FLIGHT_TICKET', 'ESIM']);

function airportLabel(a: Pick<AirportView, 'city' | 'iataCode'>): string {
  return `${a.city} (${a.iataCode})`;
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
  const flatAddons = allAddons.filter((a) => !VARIANT_CODES.has(a.code));
  const flightAddon = allAddons.find((a) => a.code === 'FLIGHT_TICKET') ?? null;
  const esimAddon = allAddons.find((a) => a.code === 'ESIM') ?? null;
  // DR-128: each add-on's real, chargeable price comes from AddonRate
  // (country + code, resolved by src/lib/addon-rates.ts) -- AddonService's
  // own flat priceMinor/currency is no longer used for pricing. An add-on
  // with no rate configured for this booking's country is simply not
  // offered here, same "hide, never fall back to a hand-typed price"
  // posture as every other Operational Rate.
  const withResolvedRates = await Promise.all(
    flatAddons.map(async (a) => {
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

  // DR-222: FLIGHT_TICKET's picker is built from every currently-effective
  // FlightFareRate row, joined against the (small, staff-curated) Airport
  // list for a human-readable label -- listPublicFlightFareOptions carries
  // only originAirportId/destinationAirportId, no joined airport fields, so
  // the join happens here rather than assuming a shape financeService
  // doesn't actually return.
  const [airports, flightFareOptions] = flightAddon
    ? await Promise.all([financeService.listPublicAirports(), financeService.listPublicFlightFareOptions()])
    : [[] as AirportView[], []];
  const airportById = new Map(airports.map((a) => [a.id, a]));
  const flightOptions = flightFareOptions
    .filter((r) => r.currency === booking.currency)
    .map((r) => {
      const origin = airportById.get(r.originAirportId);
      const destination = airportById.get(r.destinationAirportId);
      if (!origin || !destination) return null;
      return {
        originAirportId: r.originAirportId,
        originLabel: airportLabel(origin),
        destinationAirportId: r.destinationAirportId,
        destinationLabel: airportLabel(destination),
        airline: r.airline,
        flightClass: r.flightClass,
        priceMinor: r.priceMinor,
        currency: r.currency,
      };
    })
    .filter((o): o is NonNullable<typeof o> => o !== null);
  // Pre-fill an already-saved flight selection (revisiting after finalize)
  // -- BookingAddonView only snapshots the airport's IATA code, so this
  // resolves it back to a real airport id via the same list above (needed
  // since setAddons/AddonSelectionInput takes ids, not codes).
  const existingFlightSelections = selected
    .filter((a) => a.code === 'FLIGHT_TICKET' && a.originAirportCode && a.destinationAirportCode && a.airline && a.flightClass)
    .map((a) => {
      const origin = airports.find((ap) => ap.iataCode === a.originAirportCode);
      const destination = airports.find((ap) => ap.iataCode === a.destinationAirportCode);
      return {
        originAirportId: origin?.id ?? '',
        originLabel: origin ? airportLabel(origin) : (a.originAirportCode as string),
        destinationAirportId: destination?.id ?? '',
        destinationLabel: destination ? airportLabel(destination) : (a.destinationAirportCode as string),
        airline: a.airline as string,
        flightClass: a.flightClass as NonNullable<typeof a.flightClass>,
        priceMinor: a.priceMinor,
        currency: a.currency,
      };
    });

  // DR-222: the ESIM picker is a flat list of currently-effective
  // data-plan tiers for this booking's own country -- no cascading needed.
  const esimPlans = esimAddon
    ? (await financeService.listPublicEsimPlans(country)).filter((p) => p.currency === booking.currency)
    : [];
  const existingEsimSelections = selected
    .filter((a) => a.code === 'ESIM' && a.dataAllowanceGb != null)
    .map((a) => ({ dataAllowanceGb: a.dataAllowanceGb as number, priceMinor: a.priceMinor, currency: a.currency }));

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
          flightAddonId={flightAddon?.id ?? null}
          flightOptions={flightOptions}
          existingFlightSelections={existingFlightSelections}
          esimAddonId={esimAddon?.id ?? null}
          esimPlans={esimPlans}
          existingEsimSelections={existingEsimSelections}
        />
      </div>
    </Reveal>
  );
}

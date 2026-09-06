import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { AirportView } from '@modules/finance';
import { bookingService } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { financeService } from '@modules/finance';
import { immigrationService } from '@modules/immigration';
import { getEffectiveAddonRate } from '@lib/addon-rates';
import { Alert } from '@/components/ui/Alert';
import { BackLink } from '@/components/ui/BackLink';
import { Reveal } from '@/components/ui/Reveal';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { getBookingWizardSteps } from '../../../booking-wizard-steps';
import { AddonsForm } from '../../../booking/[bookingId]/addons/addons-form';
import { currentSetupBookingId, finalizeAddonsAction } from '../../actions';

export const metadata: Metadata = { robots: { index: false, follow: false } };

// FLIGHT_TICKET/ESIM are priced by a picked variant, not a flat AddonRate
// (DR-222) -- pulled out of the flat-priced list, same as the session page.
const VARIANT_CODES = new Set(['FLIGHT_TICKET', 'ESIM']);

function airportLabel(a: Pick<AirportView, 'city' | 'iataCode'>): string {
  return `${a.city} (${a.iataCode})`;
}

// The guest twin of booking/[bookingId]/addons -- same AddonsForm, same
// pricing rules, every read swapped for its no-ctx equivalent. This step is
// not optional: getBillableTotal refuses to invoice a booking whose
// addonsFinalizedAt is still null, so without finishing it here a guest
// could never be invoiced or pay. Picking nothing is a valid answer and
// still finalizes the step.
export default async function SetupAddonsPage() {
  const bookingId = await currentSetupBookingId();
  if (!bookingId) redirect('/complete-booking');

  const t = await getTranslations('AddonsPage');
  const booking = await bookingService.getForBookingSetup(bookingId);

  // Unreachable in practice (the quote is accepted before this step), kept
  // as the same defensive branch the session page has.
  if (!booking.currency) {
    return (
      <Reveal>
        <div className="mx-auto max-w-md">
          <BackLink href="/complete-booking/setup">{t('backToBooking')}</BackLink>
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
    bookingService.getBookingPackageIdForBookingSetup(bookingId),
    booking.addonsFinalizedAt
      ? bookingService.listAddonsForBookingLookup(booking.organizationId, bookingId)
      : Promise.resolve([]),
    bookingService.getBookingCountryForBookingSetup(bookingId),
  ]);

  const allAddons = packageId
    ? await catalogService.listAddonServicesForPackageLookup(booking.organizationId, packageId)
    : await catalogService.listActiveAddonServicesForLookup(booking.organizationId);
  const flatAddons = allAddons.filter((a) => !VARIANT_CODES.has(a.code));
  const flightAddon = allAddons.find((a) => a.code === 'FLIGHT_TICKET') ?? null;
  const esimAddon = allAddons.find((a) => a.code === 'ESIM') ?? null;

  const withResolvedRates = await Promise.all(
    flatAddons.map(async (a) => {
      const rate = await getEffectiveAddonRate(country, a.code);
      return rate ? { ...a, priceMinor: rate.priceMinor, currency: rate.currency } : null;
    }),
  );
  const countryPricedAddons = withResolvedRates.filter((a): a is NonNullable<typeof a> => a !== null);
  // No FX anywhere (BR-02) -- an add-on in another currency can never be
  // selected, so don't offer it.
  const addons = countryPricedAddons.filter((a) => a.currency === booking.currency);
  const selectedIds = new Set(selected.map((a) => a.addonServiceId));
  const governmentFee = await immigrationService.getPublicFee(country);

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

  const esimPlans = esimAddon
    ? (await financeService.listPublicEsimPlans(country)).filter((p) => p.currency === booking.currency)
    : [];
  const existingEsimSelections = selected
    .filter((a) => a.code === 'ESIM' && a.dataAllowanceGb != null)
    .map((a) => ({ dataAllowanceGb: a.dataAllowanceGb as number, priceMinor: a.priceMinor, currency: a.currency }));

  return (
    <Reveal>
      <div className="mx-auto max-w-md">
        <BackLink href="/complete-booking/setup">{t('backToBooking')}</BackLink>
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
          submitAction={finalizeAddonsAction}
          nextHref="/complete-booking/setup/travelers"
        />
      </div>
    </Reveal>
  );
}

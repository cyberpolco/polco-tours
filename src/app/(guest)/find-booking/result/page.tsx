import { headers } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import { assignmentService } from '@modules/assignment';
import { authService } from '@modules/auth';
import { bookingService } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { fleetService } from '@modules/fleet';
import { canDownloadInvoicePdf, invoicingService } from '@modules/invoicing';
import { itineraryService } from '@modules/itinerary';
import { ratingsService } from '@modules/ratings';
import { visaService, type VisaStatus } from '@modules/visa';
import { ApiError } from '@lib/errors';
import { Alert } from '@/components/ui/Alert';
import { BackLink } from '@/components/ui/BackLink';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { PackageImage } from '@/components/ui/PackageImage';
import { Reveal } from '@/components/ui/Reveal';
import { COUNTRY_CODES_BY_ALPHA2, flagEmoji } from '@lib/country-codes';
import { format, formatOrPending, money } from '@lib/money';
import {
  BOOKING_STATUS_TONE,
  INVOICE_STATUS_TONE,
  ITINERARY_STATUS_TONE,
  PAYMENT_STATUS_TONE,
  VISA_STATUS_TONE,
} from '@lib/status-tones';

const OPERATING_COUNTRY_CODES = new Set(['NA', 'CD', 'ZM', 'ZW']);

function countryLabel(alpha2: string, tCountries: (code: string) => string): string {
  const name = OPERATING_COUNTRY_CODES.has(alpha2) ? tCountries(alpha2) : COUNTRY_CODES_BY_ALPHA2[alpha2]?.name ?? alpha2;
  return `${flagEmoji(alpha2)} ${name}`;
}

function formatDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-US', { dateStyle: 'long' }).format(date);
}

interface Props {
  searchParams: Promise<{ bookingReference?: string; lastName?: string }>;
}

export default async function FindBookingResultPage({ searchParams }: Props) {
  const { bookingReference, lastName } = await searchParams;
  const t = await getTranslations('FindBookingResult');
  const tCountries = await getTranslations('Countries');
  const tBookingStatus = await getTranslations('BookingStatusLabel');
  const tInvoiceStatus = await getTranslations('InvoiceStatusLabel');
  const tPaymentStatus = await getTranslations('PaymentStatusLabel');
  const tPaymentKind = await getTranslations('PaymentKindLabel');
  const tItineraryStatus = await getTranslations('ItineraryStatusLabel');
  const tVisaStatus = await getTranslations('VisaStatusLabel');
  const locale = await getLocale();

  if (!bookingReference || !lastName) {
    return (
      <Reveal>
        <div className="max-w-sm">
          <Alert tone="info">{t('enterRefAndLastName')}</Alert>
          <BackLink href="/find-booking" className="mt-4">
            {t('tryAgain')}
          </BackLink>
        </div>
      </Reveal>
    );
  }

  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim();

  let result;
  try {
    result = await bookingService.lookupByBookingReference(
      { bookingReference: bookingReference.trim().toUpperCase(), lastName },
      ip,
    );
  } catch (err) {
    const message = err instanceof ApiError && err.status === 429 ? t('tooManyAttempts') : t('notFound');
    return (
      <Reveal>
        <div className="max-w-sm">
          <Alert tone="error">{message}</Alert>
          <BackLink href="/find-booking" className="mt-4">
            {t('tryAgain')}
          </BackLink>
        </div>
      </Reveal>
    );
  }

  const { booking, travelers } = result;
  const isTailorMadeInquiry =
    booking.origin === 'TAILOR_MADE' && (booking.status === 'AWAITING_QUOTATION' || booking.status === 'QUOTATION_SENT');

  // Trip/package summary + selected add-ons + billing summary for the
  // "Trip details" / "Add-ons" / "Price & payment" sections below -- same
  // trust boundary as the lifecycle-status block below. Sequential awaits,
  // not Promise.all (DR-038/041/060).
  let tripSummary: Awaited<ReturnType<typeof catalogService.getDepartureTripSummaryForBookingLookup>> = null;
  if (booking.departureId) {
    tripSummary = await catalogService.getDepartureTripSummaryForBookingLookup(booking.organizationId, booking.departureId);
  }
  // A bespoke departure (tripSummary null, tourPackageId was null) OR a
  // TAILOR_MADE booking that hasn't been converted to an operational
  // itinerary yet (no departureId at all, past the inquiry phase) -- both
  // fall back to the booking's own custom* fields, still populated either
  // way (DR-028/DR-046).
  const showCustomTripFallback =
    !isTailorMadeInquiry && !tripSummary && booking.origin === 'TAILOR_MADE' && booking.customCountry !== null;

  let addons: Awaited<ReturnType<typeof bookingService.listAddonsForBookingLookup>> = [];
  const addonNames = new Map<string, string>();
  if (booking.addonsFinalizedAt) {
    addons = await bookingService.listAddonsForBookingLookup(booking.organizationId, booking.id);
    const addonServices = await catalogService.listAddonServicesForBookingLookup(
      booking.organizationId,
      [...new Set(addons.map((a) => a.addonServiceId))],
    );
    for (const service of addonServices) addonNames.set(service.id, service.name);
  }

  let billingSummary: Awaited<ReturnType<typeof invoicingService.getBillingSummaryForBookingLookup>> = null;
  if (!isTailorMadeInquiry) {
    billingSummary = await invoicingService.getBillingSummaryForBookingLookup(booking.organizationId, booking.id);
  }

  // Lifecycle status composition for the "Trip status" section below --
  // guest, no-session lookup (the page has already verified the guest's
  // two-factor bookingReference+last-name match above, same trust boundary
  // every no-ctx "*ForBookingLookup" service method below relies on).
  // Sequential awaits throughout, not Promise.all -- this codebase's
  // documented connection-pool-exhaustion precedent (DR-038/041/060).
  let itineraryStatus: Awaited<ReturnType<typeof itineraryService.getStatusForBookingLookup>> = null;
  let vehicles: Awaited<ReturnType<typeof fleetService.listVehiclesForBookingLookup>> = [];
  let starlinkKits: Awaited<ReturnType<typeof fleetService.listStarlinkKitsByVehicleIdsForBookingLookup>> = new Map();
  const driverNames: string[] = [];
  const guideNames: string[] = [];

  if (!isTailorMadeInquiry && booking.departureId) {
    itineraryStatus = await itineraryService.getStatusForBookingLookup(booking.organizationId, booking.id);

    const assignments = await assignmentService.listAssignmentsForRating(booking.organizationId, booking.departureId);
    const vehicleIds = [...new Set(assignments.map((a) => a.vehicleId))];
    const driverProfileIds = [...new Set(assignments.map((a) => a.driverProfileId))];
    const guideUserIds = [...new Set(assignments.map((a) => a.guideUserId).filter((id): id is string => id !== null))];

    vehicles = await fleetService.listVehiclesForBookingLookup(booking.organizationId, vehicleIds);
    const drivers = await fleetService.listDriverProfilesForRating(booking.organizationId, driverProfileIds);
    starlinkKits = await fleetService.listStarlinkKitsByVehicleIdsForBookingLookup(booking.organizationId, vehicleIds);

    for (const d of drivers) {
      const user = await authService.getUser(d.userId);
      if (user?.name) driverNames.push(user.name);
    }
    for (const guideUserId of guideUserIds) {
      const user = await authService.getUser(guideUserId);
      if (user?.name) guideNames.push(user.name);
    }
  }

  // Explicit user scoping: visa status only surfaces when the finalized
  // add-ons included Visa Assistance in the first place -- never a bare
  // country-regulation dump.
  const visaStatuses = new Map<string, VisaStatus>();
  if (!isTailorMadeInquiry && booking.requiresPassportUpload) {
    for (const traveler of travelers) {
      const status = await visaService.getStatusForBookingLookup(booking.organizationId, traveler.id);
      if (status) visaStatuses.set(traveler.id, status);
    }
  }

  // Deliberately redacted -- never the raw RatingCode.code (see
  // ratingsService.getRatingCodeStatusForBookingLookup's own comment).
  const ratingCodeStatus = isTailorMadeInquiry
    ? null
    : await ratingsService.getRatingCodeStatusForBookingLookup(booking.organizationId, booking.id);

  const hasTripStatus =
    itineraryStatus !== null ||
    vehicles.length > 0 ||
    driverNames.length > 0 ||
    guideNames.length > 0 ||
    starlinkKits.size > 0 ||
    visaStatuses.size > 0 ||
    ratingCodeStatus !== null;

  return (
    <div className="max-w-md">
      <Reveal>
        <p className="eyebrow text-mist">{isTailorMadeInquiry ? t('yourTripRequest') : t('yourBooking')}</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">{booking.bookingReference}</h1>
        <p className="mt-1 flex items-center gap-2 text-mist">
          {t('seats', { count: booking.seats })} ·{' '}
          <Badge tone={BOOKING_STATUS_TONE[booking.status]}>{tBookingStatus(booking.status)}</Badge> ·{' '}
          {formatOrPending(booking.priceMinor, booking.currency)}
        </p>
      </Reveal>

      {isTailorMadeInquiry && (
        <Reveal delay={0.1}>
        <div className="pt-4">
          {booking.status === 'AWAITING_QUOTATION' && <Alert tone="success">{t('receivedTripRequest')}</Alert>}
          {booking.status === 'QUOTATION_SENT' && (
            <Alert tone="success">
              {t('quotationReadySignIn', { price: formatOrPending(booking.priceMinor, booking.currency) })}
            </Alert>
          )}
          <div className="survey-rule mt-6" />
          <div className="pt-6">
            <p className="eyebrow text-mist">{t('requestSummary')}</p>
            <Card className="mt-2">
              <dl className="space-y-2 text-sm">
                {booking.preferredCountries.length > 0 && (
                  <div>
                    <dt className="text-xs text-mist">{t('destinations')}</dt>
                    <dd>{booking.preferredCountries.map((c) => countryLabel(c, tCountries)).join(', ')}</dd>
                  </div>
                )}
                {booking.customTravelStart && booking.customTravelEnd && (
                  <div>
                    <dt className="text-xs text-mist">{t('travelDates')}</dt>
                    <dd>
                      {formatDate(booking.customTravelStart, locale)} – {formatDate(booking.customTravelEnd, locale)}
                    </dd>
                  </div>
                )}
                {booking.customDescription && (
                  <div>
                    <dt className="text-xs text-mist">{t('tripDescription')}</dt>
                    <dd>{booking.customDescription}</dd>
                  </div>
                )}
              </dl>
            </Card>
          </div>
        </div>
        </Reveal>
      )}

      {(tripSummary || showCustomTripFallback) && (
        <Reveal delay={0.15}>
          <div className="survey-rule mt-6" />
          <div className="pt-6">
            <p className="eyebrow text-mist">{t('tripDetails')}</p>
            {tripSummary ? (
              <Card className="mt-2">
                <PackageImage
                  imageUrl={tripSummary.imageUrl}
                  alt={tripSummary.title}
                  seed={booking.departureId ?? tripSummary.title}
                  className="mb-4"
                />
                <p className="font-semibold text-navy">{tripSummary.title}</p>
                <p className="mt-1 text-sm text-mist">
                  {countryLabel(tripSummary.country, tCountries)}
                  {tripSummary.durationDays != null && ` · ${t('dayTrip', { days: tripSummary.durationDays })}`}
                </p>
                <p className="mt-2 text-sm">
                  {formatDate(tripSummary.startDate, locale)}
                  {tripSummary.endDate && <> – {formatDate(tripSummary.endDate, locale)}</>}
                </p>
                <p className="mt-2 text-sm text-mist">{tripSummary.description}</p>
              </Card>
            ) : (
              <Card className="mt-2">
                <dl className="space-y-2 text-sm">
                  {booking.customCountry && (
                    <div>
                      <dt className="text-xs text-mist">{t('destination')}</dt>
                      <dd>{countryLabel(booking.customCountry, tCountries)}</dd>
                    </div>
                  )}
                  {booking.customTravelStart && booking.customTravelEnd && (
                    <div>
                      <dt className="text-xs text-mist">{t('travelDates')}</dt>
                      <dd>
                        {formatDate(booking.customTravelStart, locale)} – {formatDate(booking.customTravelEnd, locale)}
                      </dd>
                    </div>
                  )}
                  {booking.customDescription && (
                    <div>
                      <dt className="text-xs text-mist">{t('tripDescription')}</dt>
                      <dd>{booking.customDescription}</dd>
                    </div>
                  )}
                </dl>
              </Card>
            )}
          </div>
        </Reveal>
      )}

      {travelers.length > 0 && (
        <Reveal delay={0.2}>
          <div className="survey-rule mt-6" />
          <div className="pt-6">
            <p className="eyebrow text-mist">{t('travelers')}</p>
            <Card className="mt-2">
              <ul className="space-y-1 text-sm">
                {travelers.map((tv) => (
                  <li key={tv.id}>
                    {tv.firstName} {tv.lastName}{' '}
                    {tv.isTourLead && <span className="text-forest">{t('tourLeadParenthetical')}</span>}
                    {tv.isTourLead && (tv.phone || tv.email) && (
                      <div className="text-xs text-mist">{[tv.phone, tv.email].filter(Boolean).join(' · ')}</div>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </Reveal>
      )}

      {addons.length > 0 && (
        <Reveal delay={0.25}>
          <div className="survey-rule mt-6" />
          <div className="pt-6">
            <p className="eyebrow text-mist">{t('addOns')}</p>
            <Card className="mt-2">
              <ul className="space-y-1 text-sm">
                {addons.map((a) => (
                  <li key={a.id}>
                    {addonNames.get(a.addonServiceId) ?? t('addonFallbackName')} · {format(money(a.priceMinor, a.currency))}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </Reveal>
      )}

      {billingSummary && (
        <Reveal delay={0.28}>
          <div className="survey-rule mt-6" />
          <div className="pt-6">
            <p className="eyebrow text-mist">{t('priceAndPayment')}</p>
            <Card className="mt-2 space-y-3 text-sm">
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-mist">{t('subtotal')}</dt>
                  <dd>{format(money(billingSummary.subtotalMinor, billingSummary.currency))}</dd>
                </div>
                {billingSummary.discountMinor > 0 && (
                  <div>
                    <dt className="text-xs text-mist">{t('discount')}</dt>
                    <dd>−{format(money(billingSummary.discountMinor, billingSummary.currency))}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs text-mist">{t('tax')}</dt>
                  <dd>{format(money(billingSummary.taxMinor, billingSummary.currency))}</dd>
                </div>
                <div>
                  <dt className="text-xs text-mist">{t('deposit')}</dt>
                  <dd>{format(money(billingSummary.depositMinor, billingSummary.currency))}</dd>
                </div>
                <div>
                  <dt className="text-xs text-mist">{t('balance')}</dt>
                  <dd>{format(money(billingSummary.balanceMinor, billingSummary.currency))}</dd>
                </div>
                <div>
                  <dt className="text-xs text-mist">{t('total')}</dt>
                  <dd className="font-semibold text-navy">{format(money(billingSummary.totalMinor, billingSummary.currency))}</dd>
                </div>
                <div>
                  <dt className="text-xs text-mist">{t('status')}</dt>
                  <dd>
                    <Badge tone={INVOICE_STATUS_TONE[billingSummary.status]}>{tInvoiceStatus(billingSummary.status)}</Badge>
                  </dd>
                </div>
              </dl>
              {billingSummary.payments.length > 0 && (
                <div>
                  <p className="text-xs text-mist">{t('payments')}</p>
                  <ul className="mt-1 space-y-1">
                    {billingSummary.payments.map((p) => (
                      <li key={p.id}>
                        {tPaymentKind(p.kind)} · {format(money(p.amountMinor, p.currency))} ·{' '}
                        <Badge tone={PAYMENT_STATUS_TONE[p.status]}>{tPaymentStatus(p.status)}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {canDownloadInvoicePdf(billingSummary.status) && (
                <p className="text-xs text-mist">
                  {t('downloadInvoicePdf')}{' '}
                  <a
                    href={`/api/v1/find-booking/invoice-pdf?bookingReference=${encodeURIComponent(bookingReference)}&lastName=${encodeURIComponent(lastName)}&locale=en`}
                    className="font-semibold text-amber underline"
                  >
                    {t('downloadInvoiceEn')}
                  </a>{' '}
                  ·{' '}
                  <a
                    href={`/api/v1/find-booking/invoice-pdf?bookingReference=${encodeURIComponent(bookingReference)}&lastName=${encodeURIComponent(lastName)}&locale=fr`}
                    className="font-semibold text-amber underline"
                  >
                    {t('downloadInvoiceFr')}
                  </a>
                </p>
              )}
            </Card>
          </div>
        </Reveal>
      )}

      {hasTripStatus && (
        <Reveal delay={0.35}>
          <div className="survey-rule mt-6" />
          <div className="pt-6">
            <p className="eyebrow text-mist">{t('tripStatus')}</p>
            <Card className="mt-2">
            <dl className="space-y-3 text-sm">
              {itineraryStatus && (
                <div>
                  <dt className="text-xs text-mist">{t('itinerary')}</dt>
                  <dd>
                    <Badge tone={ITINERARY_STATUS_TONE[itineraryStatus]}>{tItineraryStatus(itineraryStatus)}</Badge>
                  </dd>
                </div>
              )}
              {vehicles.length > 0 && (
                <div>
                  <dt className="text-xs text-mist">{t('vehicleCount', { count: vehicles.length })}</dt>
                  <dd>
                    {vehicles
                      .map((v) => `${v.make} ${v.model} (${v.plateNumber})`)
                      .join(', ')}
                  </dd>
                </div>
              )}
              {driverNames.length > 0 && (
                <div>
                  <dt className="text-xs text-mist">{t('driverCount', { count: driverNames.length })}</dt>
                  <dd>{driverNames.join(', ')}</dd>
                </div>
              )}
              {guideNames.length > 0 && (
                <div>
                  <dt className="text-xs text-mist">{t('guideCount', { count: guideNames.length })}</dt>
                  <dd>{guideNames.join(', ')}</dd>
                </div>
              )}
              {starlinkKits.size > 0 && (
                <div>
                  <dt className="text-xs text-mist">{t('vehicleTracking')}</dt>
                  <dd>{t('starlinkAssigned', { count: starlinkKits.size })}</dd>
                </div>
              )}
              {visaStatuses.size > 0 && (
                <div>
                  <dt className="text-xs text-mist">{t('visaStatus')}</dt>
                  <dd className="space-y-1">
                    {travelers
                      .filter((tv) => visaStatuses.has(tv.id))
                      .map((tv) => (
                        <div key={tv.id} className="flex items-center gap-2">
                          <span>
                            {tv.firstName} {tv.lastName}
                          </span>
                          <Badge tone={VISA_STATUS_TONE[visaStatuses.get(tv.id)!]}>{tVisaStatus(visaStatuses.get(tv.id)!)}</Badge>
                        </div>
                      ))}
                  </dd>
                </div>
              )}
              {ratingCodeStatus && (
                <div>
                  <dt className="text-xs text-mist">{t('feedback')}</dt>
                  <dd>{ratingCodeStatus.available ? t('ratingCodeAvailable') : t('ratingCodeUnavailable')}</dd>
                </div>
              )}
            </dl>
            </Card>
          </div>
        </Reveal>
      )}
    </div>
  );
}

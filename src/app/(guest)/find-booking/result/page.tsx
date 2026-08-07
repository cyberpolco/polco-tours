import { headers } from 'next/headers';
import { assignmentService } from '@modules/assignment';
import { authService } from '@modules/auth';
import { bookingService } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { fleetService } from '@modules/fleet';
import { invoicingService } from '@modules/invoicing';
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

function countryLabel(alpha2: string): string {
  const name = COUNTRY_CODES_BY_ALPHA2[alpha2]?.name ?? alpha2;
  return `${flagEmoji(alpha2)} ${name}`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(date);
}

interface Props {
  searchParams: Promise<{ bookingReference?: string; lastName?: string }>;
}

export default async function FindBookingResultPage({ searchParams }: Props) {
  const { bookingReference, lastName } = await searchParams;

  if (!bookingReference || !lastName) {
    return (
      <Reveal>
        <div className="max-w-sm">
          <Alert tone="info">Enter a booking reference and last name.</Alert>
          <BackLink href="/find-booking" className="mt-4">try again</BackLink>
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
    const message =
      err instanceof ApiError && err.status === 429
        ? 'Too many attempts -- please try again later.'
        : "We couldn't find a booking matching that code and last name.";
    return (
      <Reveal>
        <div className="max-w-sm">
          <Alert tone="error">{message}</Alert>
          <BackLink href="/find-booking" className="mt-4">try again</BackLink>
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
        <p className="eyebrow text-mist">{isTailorMadeInquiry ? 'Your trip request' : 'Your booking'}</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">{booking.bookingReference}</h1>
        <p className="mt-1 flex items-center gap-2 text-mist">
          {booking.seats} seat(s) · <Badge tone={BOOKING_STATUS_TONE[booking.status]}>{booking.status}</Badge> ·{' '}
          {formatOrPending(booking.priceMinor, booking.currency)}
        </p>
      </Reveal>

      {isTailorMadeInquiry && (
        <Reveal delay={0.1}>
        <div className="pt-4">
          {booking.status === 'AWAITING_QUOTATION' && (
            <Alert tone="success">We&apos;ve received your trip request -- our team will be in touch soon with a quotation.</Alert>
          )}
          {booking.status === 'QUOTATION_SENT' && (
            <Alert tone="success">
              Your quotation is ready: {formatOrPending(booking.priceMinor, booking.currency)}. Sign back in on the device you
              requested from to accept it and continue.
            </Alert>
          )}
          <div className="survey-rule mt-6" />
          <div className="pt-6">
            <p className="eyebrow text-mist">Request summary</p>
            <Card className="mt-2">
              <dl className="space-y-2 text-sm">
                {booking.preferredCountries.length > 0 && (
                  <div>
                    <dt className="text-xs text-mist">Destination(s)</dt>
                    <dd>{booking.preferredCountries.map(countryLabel).join(', ')}</dd>
                  </div>
                )}
                {booking.customTravelStart && booking.customTravelEnd && (
                  <div>
                    <dt className="text-xs text-mist">Travel dates</dt>
                    <dd>
                      {formatDate(booking.customTravelStart)} to {formatDate(booking.customTravelEnd)}
                    </dd>
                  </div>
                )}
                {booking.customDescription && (
                  <div>
                    <dt className="text-xs text-mist">Trip description</dt>
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
            <p className="eyebrow text-mist">Trip details</p>
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
                  {countryLabel(tripSummary.country)}
                  {tripSummary.durationDays != null && ` · ${tripSummary.durationDays}-day trip`}
                </p>
                <p className="mt-2 text-sm">
                  {formatDate(tripSummary.startDate)}
                  {tripSummary.endDate && <> – {formatDate(tripSummary.endDate)}</>}
                </p>
                <p className="mt-2 text-sm text-mist">{tripSummary.description}</p>
              </Card>
            ) : (
              <Card className="mt-2">
                <dl className="space-y-2 text-sm">
                  {booking.customCountry && (
                    <div>
                      <dt className="text-xs text-mist">Destination</dt>
                      <dd>{countryLabel(booking.customCountry)}</dd>
                    </div>
                  )}
                  {booking.customTravelStart && booking.customTravelEnd && (
                    <div>
                      <dt className="text-xs text-mist">Travel dates</dt>
                      <dd>
                        {formatDate(booking.customTravelStart)} to {formatDate(booking.customTravelEnd)}
                      </dd>
                    </div>
                  )}
                  {booking.customDescription && (
                    <div>
                      <dt className="text-xs text-mist">Trip description</dt>
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
            <p className="eyebrow text-mist">Travelers</p>
            <Card className="mt-2">
              <ul className="space-y-1 text-sm">
                {travelers.map((t) => (
                  <li key={t.id}>
                    {t.firstName} {t.lastName} {t.isTourLead && <span className="text-forest">(tour lead)</span>}
                    {t.isTourLead && (t.phone || t.email) && (
                      <div className="text-xs text-mist">{[t.phone, t.email].filter(Boolean).join(' · ')}</div>
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
            <p className="eyebrow text-mist">Add-ons</p>
            <Card className="mt-2">
              <ul className="space-y-1 text-sm">
                {addons.map((a) => (
                  <li key={a.id}>
                    {addonNames.get(a.addonServiceId) ?? 'Add-on'} · {format(money(a.priceMinor, a.currency))}
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
            <p className="eyebrow text-mist">Price &amp; payment</p>
            <Card className="mt-2 space-y-3 text-sm">
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-mist">Subtotal</dt>
                  <dd>{format(money(billingSummary.subtotalMinor, billingSummary.currency))}</dd>
                </div>
                <div>
                  <dt className="text-xs text-mist">Tax</dt>
                  <dd>{format(money(billingSummary.taxMinor, billingSummary.currency))}</dd>
                </div>
                <div>
                  <dt className="text-xs text-mist">Deposit</dt>
                  <dd>{format(money(billingSummary.depositMinor, billingSummary.currency))}</dd>
                </div>
                <div>
                  <dt className="text-xs text-mist">Balance</dt>
                  <dd>{format(money(billingSummary.balanceMinor, billingSummary.currency))}</dd>
                </div>
                <div>
                  <dt className="text-xs text-mist">Total</dt>
                  <dd className="font-semibold text-navy">{format(money(billingSummary.totalMinor, billingSummary.currency))}</dd>
                </div>
                <div>
                  <dt className="text-xs text-mist">Status</dt>
                  <dd>
                    <Badge tone={INVOICE_STATUS_TONE[billingSummary.status]}>{billingSummary.status}</Badge>
                  </dd>
                </div>
              </dl>
              {billingSummary.payments.length > 0 && (
                <div>
                  <p className="text-xs text-mist">Payments</p>
                  <ul className="mt-1 space-y-1">
                    {billingSummary.payments.map((p) => (
                      <li key={p.id}>
                        {p.kind} · {format(money(p.amountMinor, p.currency))} ·{' '}
                        <Badge tone={PAYMENT_STATUS_TONE[p.status]}>{p.status}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </div>
        </Reveal>
      )}

      {hasTripStatus && (
        <Reveal delay={0.35}>
          <div className="survey-rule mt-6" />
          <div className="pt-6">
            <p className="eyebrow text-mist">Trip status</p>
            <Card className="mt-2">
            <dl className="space-y-3 text-sm">
              {itineraryStatus && (
                <div>
                  <dt className="text-xs text-mist">Itinerary</dt>
                  <dd>
                    <Badge tone={ITINERARY_STATUS_TONE[itineraryStatus]}>{itineraryStatus}</Badge>
                  </dd>
                </div>
              )}
              {vehicles.length > 0 && (
                <div>
                  <dt className="text-xs text-mist">Vehicle{vehicles.length > 1 ? 's' : ''}</dt>
                  <dd>
                    {vehicles
                      .map((v) => `${v.make} ${v.model} (${v.plateNumber})`)
                      .join(', ')}
                  </dd>
                </div>
              )}
              {driverNames.length > 0 && (
                <div>
                  <dt className="text-xs text-mist">Driver{driverNames.length > 1 ? 's' : ''}</dt>
                  <dd>{driverNames.join(', ')}</dd>
                </div>
              )}
              {guideNames.length > 0 && (
                <div>
                  <dt className="text-xs text-mist">Guide{guideNames.length > 1 ? 's' : ''}</dt>
                  <dd>{guideNames.join(', ')}</dd>
                </div>
              )}
              {starlinkKits.size > 0 && (
                <div>
                  <dt className="text-xs text-mist">Vehicle tracking</dt>
                  <dd>Starlink kit assigned to your vehicle{starlinkKits.size > 1 ? 's' : ''}.</dd>
                </div>
              )}
              {visaStatuses.size > 0 && (
                <div>
                  <dt className="text-xs text-mist">Visa status</dt>
                  <dd className="space-y-1">
                    {travelers
                      .filter((t) => visaStatuses.has(t.id))
                      .map((t) => (
                        <div key={t.id} className="flex items-center gap-2">
                          <span>
                            {t.firstName} {t.lastName}
                          </span>
                          <Badge tone={VISA_STATUS_TONE[visaStatuses.get(t.id)!]}>{visaStatuses.get(t.id)}</Badge>
                        </div>
                      ))}
                  </dd>
                </div>
              )}
              {ratingCodeStatus && (
                <div>
                  <dt className="text-xs text-mist">Feedback</dt>
                  <dd>
                    {ratingCodeStatus.available
                      ? 'A rating code has been issued for your trip -- check your confirmation email or contact our team for it.'
                      : 'Your rating code has already been used or has expired.'}
                  </dd>
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

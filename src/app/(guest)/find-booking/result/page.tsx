import Link from 'next/link';
import { headers } from 'next/headers';
import { assignmentService } from '@modules/assignment';
import { authService } from '@modules/auth';
import { bookingService } from '@modules/booking';
import { fleetService } from '@modules/fleet';
import { itineraryService } from '@modules/itinerary';
import { ratingsService } from '@modules/ratings';
import { visaService, type VisaStatus } from '@modules/visa';
import { ApiError } from '@lib/errors';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { COUNTRY_CODES_BY_ALPHA2, flagEmoji } from '@lib/country-codes';
import { formatOrPending } from '@lib/money';
import { BOOKING_STATUS_TONE, ITINERARY_STATUS_TONE, VISA_STATUS_TONE } from '@lib/status-tones';

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
      <div className="max-w-sm">
        <Alert tone="info">Enter a booking reference and last name.</Alert>
        <Link href="/find-booking" className="mt-4 inline-block text-sm text-forest hover:underline">
          ← try again
        </Link>
      </div>
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
      <div className="max-w-sm">
        <Alert tone="error">{message}</Alert>
        <Link href="/find-booking" className="mt-4 inline-block text-sm text-forest hover:underline">
          ← try again
        </Link>
      </div>
    );
  }

  const { booking, travelers } = result;
  const isTailorMadeInquiry =
    booking.origin === 'TAILOR_MADE' && (booking.status === 'AWAITING_QUOTATION' || booking.status === 'QUOTATION_SENT');

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
      <p className="eyebrow text-mist">{isTailorMadeInquiry ? 'Your trip request' : 'Your booking'}</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">{booking.bookingReference}</h1>
      <p className="mt-1 flex items-center gap-2 text-mist">
        {booking.seats} seat(s) · <Badge tone={BOOKING_STATUS_TONE[booking.status]}>{booking.status}</Badge> ·{' '}
        {formatOrPending(booking.priceMinor, booking.currency)}
      </p>

      {isTailorMadeInquiry && (
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
            <dl className="mt-2 space-y-2 text-sm">
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
          </div>
        </div>
      )}

      {travelers.length > 0 && (
        <>
          <div className="survey-rule mt-6" />
          <div className="pt-6">
            <p className="eyebrow text-mist">Travelers</p>
            <ul className="mt-2 space-y-1 text-sm">
              {travelers.map((t) => (
                <li key={t.id}>
                  {t.firstName} {t.lastName} {t.isTourLead && <span className="text-forest">(tour lead)</span>}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {hasTripStatus && (
        <>
          <div className="survey-rule mt-6" />
          <div className="pt-6">
            <p className="eyebrow text-mist">Trip status</p>
            <dl className="mt-2 space-y-3 text-sm">
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
          </div>
        </>
      )}

      <p className="mt-6 text-sm text-mist">
        {isTailorMadeInquiry
          ? 'To accept a quotation or make a change, sign back in on the device you requested from, or contact our team with your reference code above.'
          : 'For payment or itinerary changes, contact our team with your reference code above.'}
      </p>
    </div>
  );
}

import Link from 'next/link';
import { headers } from 'next/headers';
import { bookingService } from '@modules/booking';
import { ApiError } from '@lib/errors';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { COUNTRY_CODES_BY_ALPHA2, flagEmoji } from '@lib/country-codes';
import { formatOrPending } from '@lib/money';
import { BOOKING_STATUS_TONE } from '@lib/status-tones';

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

      <p className="mt-6 text-sm text-mist">
        {isTailorMadeInquiry
          ? 'To accept a quotation or make a change, sign back in on the device you requested from, or contact our team with your reference code above.'
          : 'For payment or itinerary changes, contact our team with your reference code above.'}
      </p>
    </div>
  );
}

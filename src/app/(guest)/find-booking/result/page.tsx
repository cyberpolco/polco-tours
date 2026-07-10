import Link from 'next/link';
import { headers } from 'next/headers';
import { bookingService } from '@modules/booking';
import { ApiError } from '@lib/errors';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { format, money } from '@lib/money';
import { BOOKING_STATUS_TONE } from '../../badge-tones';

interface Props {
  searchParams: Promise<{ confirmationCode?: string; lastName?: string }>;
}

export default async function FindBookingResultPage({ searchParams }: Props) {
  const { confirmationCode, lastName } = await searchParams;

  if (!confirmationCode || !lastName) {
    return (
      <div className="max-w-sm">
        <Alert tone="info">Enter a reference code and last name.</Alert>
        <Link href="/find-booking" className="mt-4 inline-block text-sm text-forest hover:underline">
          ← try again
        </Link>
      </div>
    );
  }

  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim();

  let result;
  try {
    result = await bookingService.lookupByConfirmationCode(
      { confirmationCode: confirmationCode.trim().toUpperCase(), lastName },
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

  return (
    <div className="max-w-md">
      <p className="eyebrow text-mist">Your booking</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">{booking.confirmationCode}</h1>
      <p className="mt-1 flex items-center gap-2 text-mist">
        {booking.seats} seat(s) · <Badge tone={BOOKING_STATUS_TONE[booking.status]}>{booking.status}</Badge> ·{' '}
        {format(money(booking.priceMinor, booking.currency))}
      </p>

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

      <p className="mt-6 text-sm text-mist">
        For payment or itinerary changes, contact our team with your reference code above.
      </p>
    </div>
  );
}

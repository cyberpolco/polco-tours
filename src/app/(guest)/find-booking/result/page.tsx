import Link from 'next/link';
import { headers } from 'next/headers';
import { bookingService } from '@modules/booking';
import { ApiError } from '@lib/errors';
import { format, money } from '@lib/money';

interface Props {
  searchParams: Promise<{ confirmationCode?: string; lastName?: string }>;
}

export default async function FindBookingResultPage({ searchParams }: Props) {
  const { confirmationCode, lastName } = await searchParams;

  if (!confirmationCode || !lastName) {
    return (
      <div className="max-w-sm">
        <p className="text-sm text-amber">Enter a reference code and last name.</p>
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
        <p className="text-sm text-amber">{message}</p>
        <Link href="/find-booking" className="mt-4 inline-block text-sm text-forest hover:underline">
          ← try again
        </Link>
      </div>
    );
  }

  const { booking, travelers } = result;

  return (
    <div className="max-w-md">
      <p className="text-xs tracking-survey text-mist">YOUR BOOKING</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">{booking.confirmationCode}</h1>
      <p className="mt-1 text-mist">
        {booking.seats} seat(s) · {booking.status} · {format(money(booking.priceMinor, booking.currency))}
      </p>

      <div className="mt-6 border-t border-rule pt-6">
        <p className="text-xs tracking-survey text-mist">TRAVELERS</p>
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

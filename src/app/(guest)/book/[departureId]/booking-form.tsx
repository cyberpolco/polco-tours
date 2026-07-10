'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@lib/auth-client';
import { COUNTRY_CODES, flagEmoji } from '@lib/country-codes';
import { createGuestBookingAction } from './actions';

interface Props {
  departureId: string;
  capacity: number;
}

// The one Client Component in the guest flow -- establishing the anonymous
// session (authClient.signIn.anonymous()) has to happen in the browser
// before the Server Action runs, mirroring staff/login/page.tsx's role as
// this codebase's only other browser-side auth interaction.
export default function BookingForm({ departureId, capacity }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const session = await authClient.getSession();
    if (!session.data) {
      const { error: signInError } = await authClient.signIn.anonymous();
      if (signInError) {
        setError(signInError.message ?? 'Could not start your booking -- try again.');
        setPending(false);
        return;
      }
    }

    const formData = new FormData(e.currentTarget);
    const result = await createGuestBookingAction(departureId, formData);
    if ('error' in result) {
      setError(
        result.error === 'sold_out'
          ? 'This departure just sold out -- try a different date.'
          : 'Something interrupted starting your booking -- please try again.',
      );
      setPending(false);
      return;
    }
    router.push(`/booking/${result.bookingId}`);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div>
        <label htmlFor="seats" className="mb-1 block text-sm text-mist">
          Seats
        </label>
        <input
          id="seats"
          name="seats"
          type="number"
          min={1}
          max={capacity}
          defaultValue={1}
          required
          className="w-full rounded-survey border border-rule px-3 py-2"
        />
      </div>

      <div>
        <label htmlFor="name" className="mb-1 block text-sm text-mist">
          Your name
        </label>
        <input id="name" name="name" required className="w-full rounded-survey border border-rule px-3 py-2" />
      </div>

      <div>
        <p className="mb-1 text-sm text-mist">Phone (so we can reach you about your booking)</p>
        <div className="flex gap-2">
          <select name="dialCode" defaultValue="264" className="rounded-survey border border-rule px-2 py-2">
            {COUNTRY_CODES.map((c) => (
              <option key={c.alpha2} value={c.dialCode}>
                {flagEmoji(c.alpha2)} +{c.dialCode}
              </option>
            ))}
          </select>
          <input
            name="localNumber"
            type="tel"
            required
            placeholder="81 234 5678"
            className="flex-1 rounded-survey border border-rule px-3 py-2"
          />
        </div>
      </div>

      {error && <p className="text-sm text-amber">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-survey bg-amber px-5 py-2 text-sm font-semibold text-navy disabled:opacity-50"
      >
        {pending ? 'Starting your booking…' : 'Start my booking'}
      </button>
    </form>
  );
}

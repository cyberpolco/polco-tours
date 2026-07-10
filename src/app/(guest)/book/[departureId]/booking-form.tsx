'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
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

    // Build FormData BEFORE any await -- React nulls out e.currentTarget
    // once the synchronous portion of the handler returns (an async handler
    // returns a pending Promise immediately, so the synthetic event is
    // already recycled by the time execution resumes after the first
    // await). Reading it any later throws "Failed to construct 'FormData':
    // parameter 1 is not of type 'HTMLFormElement'" -- this manifested as a
    // silently-stuck form until browser console diagnostics against real CI
    // caught it (DR-016).
    const formData = new FormData(e.currentTarget);

    // Everything here is wrapped -- an uncaught throw in a plain (non-<form
    // action>) event handler becomes an invisible unhandled promise
    // rejection, a worse failure mode than an honest (if generic) message.
    try {
      const session = await authClient.getSession();
      if (!session.data) {
        const { error: signInError } = await authClient.signIn.anonymous();
        if (signInError) {
          setError(signInError.message ?? 'Could not start your booking -- try again.');
          return;
        }
      }

      const result = await createGuestBookingAction(departureId, formData);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      router.push(`/booking/${result.bookingId}`);
    } catch {
      setError('Something went wrong starting your booking -- please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <FormField label="Seats" htmlFor="seats">
        <input
          name="seats"
          type="number"
          min={1}
          max={capacity}
          defaultValue={1}
          required
          className="w-full rounded-survey border border-rule px-3 py-2"
        />
      </FormField>

      <FormField label="Your name" htmlFor="name">
        <input name="name" required className="w-full rounded-survey border border-rule px-3 py-2" />
      </FormField>

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

      {error && <Alert tone="error">{error}</Alert>}

      <Button type="submit" disabled={pending}>
        {pending ? 'Starting your booking…' : 'Start my booking'}
      </Button>
    </form>
  );
}

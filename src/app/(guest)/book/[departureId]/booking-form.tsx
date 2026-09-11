'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Select } from '@/components/ui/Select';
import { authClient } from '@lib/auth-client';
import { COUNTRY_CODES_ALPHABETICAL, flagEmoji } from '@lib/country-codes';
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
  const t = useTranslations('BookingStart');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seats, setSeats] = useState(1);

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
          setError(signInError.message ?? t('errorCouldNotStart'));
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
      setError(t('errorGeneric'));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div>
        <p className="mb-1 text-sm text-mist">{t('seats')}</p>
        {/* Explicit user request (same fix as plan-my-trip, DR-273): a plain
            number input couldn't be edited reliably on mobile -- +/- buttons
            replace it here too, capped at the departure's remaining
            capacity and never going below 1. */}
        <input type="hidden" name="seats" value={seats} />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSeats((s) => Math.max(1, s - 1))}
            disabled={seats <= 1}
            aria-label={t('decreaseTravelers')}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-navy text-xl font-semibold text-navy transition-colors duration-200 hover:bg-navy hover:text-bone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bone disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40"
          >
            −
          </button>
          <span className="w-8 text-center text-lg font-semibold text-ink" aria-live="polite">
            {seats}
          </span>
          <button
            type="button"
            onClick={() => setSeats((s) => Math.min(capacity, s + 1))}
            disabled={seats >= capacity}
            aria-label={t('increaseTravelers')}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-navy text-xl font-semibold text-navy transition-colors duration-200 hover:bg-navy hover:text-bone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bone disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label={t('firstName')} htmlFor="firstName">
          <input name="firstName" required autoComplete="off" className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label={t('lastName')} htmlFor="lastName">
          <input name="lastName" required autoComplete="off" className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
      </div>

      <div>
        <p className="mb-1 text-sm text-mist">{t('phoneNotice')}</p>
        <div className="flex gap-2">
          <Select name="dialCode" defaultValue="264">
            {COUNTRY_CODES_ALPHABETICAL.map((c) => (
              <option key={c.alpha2} value={c.dialCode}>
                {flagEmoji(c.alpha2)} +{c.dialCode}
              </option>
            ))}
          </Select>
          <input
            name="localNumber"
            type="tel"
            required
            autoComplete="off"
            placeholder={t('phonePlaceholder')}
            className="flex-1 rounded-survey border border-rule px-3 py-2"
          />
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <Button type="submit" disabled={pending}>
        {pending ? t('startingBooking') : t('startMyBooking')}
      </Button>
    </form>
  );
}

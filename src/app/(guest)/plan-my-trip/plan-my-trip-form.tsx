'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { authClient } from '@lib/auth-client';
import { COUNTRY_CODES, flagEmoji } from '@lib/country-codes';
import { DESTINATION_SITES } from '@lib/destination-sites';
import { createPlanMyTripRequestAction } from './actions';

const TAGS = ['WILDLIFE', 'ADVENTURE', 'RELAXATION', 'FAMILY', 'CULTURE', 'LUXURY', 'BUDGET'] as const;

function titleCase(tag: string): string {
  return tag.charAt(0) + tag.slice(1).toLowerCase();
}

// Merges the old tailor-made form's practical fields (country/dates/seats/
// description/contact -- these create the real Booking) with the old
// quiz's preference questions (tags/sites -- now stored as staff context
// on the booking, not scored against packages, DR-046). Same anonymous-
// session-then-server-action shape as (guest)/book/[departureId]/
// booking-form.tsx -- see that file for the FormData-before-await and
// error-handling reasoning this copies verbatim.
export default function PlanMyTripForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData(e.currentTarget);

    try {
      const session = await authClient.getSession();
      if (!session.data) {
        const { error: signInError } = await authClient.signIn.anonymous();
        if (signInError) {
          setError(signInError.message ?? 'Could not start your request -- try again.');
          return;
        }
      }

      const result = await createPlanMyTripRequestAction(formData);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      router.push(`/booking/${result.bookingId}`);
    } catch {
      setError('Something went wrong submitting your request -- please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-6">
      <FormField label="Destination country" htmlFor="customCountry">
        <select name="customCountry" required className="w-full rounded-survey border border-rule px-3 py-2">
          <option value="NA">🇳🇦 Namibia</option>
          <option value="CD">🇨🇩 DR Congo</option>
          <option value="ZM">🇿🇲 Zambia</option>
          <option value="ZW">🇿🇼 Zimbabwe</option>
        </select>
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Travel start" htmlFor="customTravelStart">
          <input name="customTravelStart" type="date" required className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label="Travel end" htmlFor="customTravelEnd">
          <input name="customTravelEnd" type="date" required className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
      </div>

      <FormField label="Travelers" htmlFor="seats">
        <input
          name="seats"
          type="number"
          min={1}
          defaultValue={1}
          required
          className="w-full rounded-survey border border-rule px-3 py-2"
        />
      </FormField>

      <div>
        <p className="mb-2 text-sm text-mist">What matters most? (pick any)</p>
        <div className="grid grid-cols-2 gap-2">
          {TAGS.map((tag) => (
            <SelectableCard key={tag} type="checkbox" name="tags" value={tag}>
              {titleCase(tag)}
            </SelectableCard>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm text-mist">Sites you&apos;d like to visit (pick any)</p>
        <div className="grid grid-cols-2 gap-2">
          {DESTINATION_SITES.map(({ name }) => (
            <SelectableCard key={name} type="checkbox" name="sites" value={name}>
              {name}
            </SelectableCard>
          ))}
        </div>
      </div>

      <FormField label="Tell us about the trip you have in mind" htmlFor="customDescription">
        <textarea name="customDescription" required rows={4} className="w-full rounded-survey border border-rule px-3 py-2" />
      </FormField>

      <FormField label="Special requests" htmlFor="specialRequests" optional>
        <textarea name="specialRequests" rows={2} className="w-full rounded-survey border border-rule px-3 py-2" />
      </FormField>

      <FormField label="Your name" htmlFor="name">
        <input name="name" required className="w-full rounded-survey border border-rule px-3 py-2" />
      </FormField>

      <div>
        <p className="mb-1 text-sm text-mist">Phone (so we can reach you about your trip)</p>
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
        {pending ? 'Submitting…' : 'Request my quotation'}
      </Button>
    </form>
  );
}

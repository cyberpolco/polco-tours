'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { authClient } from '@lib/auth-client';
import { COUNTRY_CODES, flagEmoji } from '@lib/country-codes';
import { DESTINATION_SITES } from '@lib/destination-sites';
import { createPlanMyTripRequestAction } from './actions';

const TAGS = ['WILDLIFE', 'ADVENTURE', 'RELAXATION', 'FAMILY', 'CULTURE', 'LUXURY', 'BUDGET'] as const;

// Mirrors booking/domain.ts's local ADDON_CODES -- kept in sync by hand,
// same as that constant's own comment explains (catalog doesn't export a
// validating vocabulary for AddonCode yet, only PACKAGE_TAGS).
const ADDONS = ['PHOTOGRAPHY', 'VIDEOGRAPHY', 'TRANSLATOR', 'VISA_ASSISTANCE'] as const;

const DESTINATIONS = [
  { code: 'NA', label: '🇳🇦 Namibia' },
  { code: 'CD', label: '🇨🇩 DR Congo' },
  { code: 'ZM', label: '🇿🇲 Zambia' },
  { code: 'ZW', label: '🇿🇼 Zimbabwe' },
] as const;

// DR-047: one question per step, gradual with a progress indicator on top --
// replaces the old single-page layout. State lives here (not native form
// fields) since later steps (sites) depend on an earlier answer (countries)
// and the final submit needs everything assembled into one payload.
const STEPS = ['Destination', 'Dates', 'Travelers', 'Preferences', 'Sites', 'Your trip', 'Add-ons', 'Special requests', 'Contact'];

function titleCase(tag: string): string {
  return tag.charAt(0) + tag.slice(1).toLowerCase();
}

function addonLabel(code: string): string {
  return code
    .split('_')
    .map(titleCase)
    .join(' ');
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function PlanMyTripForm() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [countries, setCountries] = useState<string[]>([]);
  const [customTravelStart, setCustomTravelStart] = useState('');
  const [customTravelEnd, setCustomTravelEnd] = useState('');
  const [seats, setSeats] = useState(1);
  const [tags, setTags] = useState<string[]>([]);
  const [sites, setSites] = useState<string[]>([]);
  const [customDescription, setCustomDescription] = useState('');
  const [preferredAddons, setPreferredAddons] = useState<string[]>([]);
  const [countryOfResidence, setCountryOfResidence] = useState('');
  const [citizenship, setCitizenship] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [dialCode, setDialCode] = useState('264');
  const [localNumber, setLocalNumber] = useState('');

  // Only sites belonging to a selected country are offered -- a site ticked
  // before its country was deselected is dropped rather than silently kept.
  const availableSites = useMemo(() => DESTINATION_SITES.filter((s) => countries.includes(s.country)), [countries]);

  const datesValid = customTravelStart !== '' && customTravelEnd !== '' && customTravelEnd >= customTravelStart;
  const canAdvance = [
    countries.length > 0,
    datesValid,
    seats >= 1,
    true, // preferences (tags) -- optional
    true, // sites -- optional
    true, // your trip (description) -- optional (DR-048)
    true, // add-ons + residence/citizenship -- optional
    true, // special requests -- optional
    firstName.trim() !== '' && lastName.trim() !== '' && email.trim() !== '' && localNumber.trim() !== '',
  ][step];

  function next() {
    if (step === 0 && countries.length > 0) {
      // Drop any previously-picked site whose country is no longer selected.
      setSites((current) => current.filter((name) => DESTINATION_SITES.some((s) => s.name === name && countries.includes(s.country))));
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit() {
    setError(null);
    setPending(true);
    try {
      const session = await authClient.getSession();
      if (!session.data) {
        const { error: signInError } = await authClient.signIn.anonymous();
        if (signInError) {
          setError(signInError.message ?? 'Could not start your request -- try again.');
          return;
        }
      }

      const result = await createPlanMyTripRequestAction({
        countries,
        customTravelStart,
        customTravelEnd,
        seats,
        preferredTags: tags,
        preferredSites: sites,
        customDescription: customDescription || undefined,
        preferredAddons,
        countryOfResidence: countryOfResidence || undefined,
        citizenship: citizenship || undefined,
        specialRequests: specialRequests || undefined,
        firstName,
        lastName,
        email,
        dialCode,
        localNumber,
      });
      if ('error' in result) {
        setError(result.error);
        return;
      }
      // /booking/[bookingId] shows a reference-only confirmation for a
      // fresh AWAITING_QUOTATION booking (see that page's own comment,
      // DR-047) -- no separate confirmation route needed.
      router.push(`/booking/${result.bookingId}`);
    } catch {
      setError('Something went wrong submitting your request -- please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Every later step already has a "← Back" button (below, client-side
          state, nothing lost); step 0 has nowhere in-wizard to go back to,
          so it gets a real link out instead, same convention as the other
          wizards' entry-point back links. */}
      {step === 0 && (
        <Link href="/" className="text-sm text-forest hover:underline">
          ← back to homepage
        </Link>
      )}
      <StepIndicator steps={STEPS} currentIndex={step} />

      {step === 0 && (
        <div>
          <p className="mb-2 text-sm text-mist">Which countries? (pick at least one)</p>
          <div className="grid grid-cols-2 gap-2">
            {DESTINATIONS.map(({ code, label }) => (
              <SelectableCard
                key={code}
                type="checkbox"
                checked={countries.includes(code)}
                onChange={() => setCountries((c) => toggle(c, code))}
              >
                {label}
              </SelectableCard>
            ))}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Travel start" htmlFor="customTravelStart">
            <input
              type="date"
              value={customTravelStart}
              onChange={(e) => setCustomTravelStart(e.target.value)}
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
          <FormField label="Travel end" htmlFor="customTravelEnd">
            <input
              type="date"
              value={customTravelEnd}
              onChange={(e) => setCustomTravelEnd(e.target.value)}
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
          {customTravelStart && customTravelEnd && !datesValid && (
            <p className="col-span-2 text-xs text-amber">Travel end must be on or after travel start.</p>
          )}
        </div>
      )}

      {step === 2 && (
        <FormField label="Travelers" htmlFor="seats">
          <input
            type="number"
            min={1}
            value={seats}
            onChange={(e) => setSeats(Math.max(1, Number(e.target.value)))}
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
      )}

      {step === 3 && (
        <div>
          <p className="mb-2 text-sm text-mist">What matters most? (pick any)</p>
          <div className="grid grid-cols-2 gap-2">
            {TAGS.map((tag) => (
              <SelectableCard key={tag} type="checkbox" checked={tags.includes(tag)} onChange={() => setTags((t) => toggle(t, tag))}>
                {titleCase(tag)}
              </SelectableCard>
            ))}
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          <p className="mb-2 text-sm text-mist">
            Sites you&apos;d like to visit (pick any)
            {availableSites.length === 0 && ' -- go back and pick a country to see options here'}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {availableSites.map(({ name }) => (
              <SelectableCard key={name} type="checkbox" checked={sites.includes(name)} onChange={() => setSites((s) => toggle(s, name))}>
                {name}
              </SelectableCard>
            ))}
          </div>
        </div>
      )}

      {step === 5 && (
        <FormField label="Tell us about the trip you have in mind" htmlFor="customDescription" optional>
          <textarea
            value={customDescription}
            onChange={(e) => setCustomDescription(e.target.value)}
            rows={4}
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
      )}

      {step === 6 && (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm text-mist">Add-ons you might want (pick any)</p>
            <div className="grid grid-cols-2 gap-2">
              {ADDONS.map((code) => (
                <SelectableCard
                  key={code}
                  type="checkbox"
                  checked={preferredAddons.includes(code)}
                  onChange={() => setPreferredAddons((a) => toggle(a, code))}
                >
                  {addonLabel(code)}
                </SelectableCard>
              ))}
            </div>
          </div>
          <FormField label="Country of residence" htmlFor="countryOfResidence" optional>
            <select
              value={countryOfResidence}
              onChange={(e) => setCountryOfResidence(e.target.value)}
              className="w-full rounded-survey border border-rule px-3 py-2"
            >
              <option value="">Prefer not to say</option>
              {COUNTRY_CODES.map((c) => (
                <option key={c.alpha2} value={c.alpha2}>
                  {flagEmoji(c.alpha2)} {c.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Citizenship" htmlFor="citizenship" optional>
            <select
              value={citizenship}
              onChange={(e) => setCitizenship(e.target.value)}
              className="w-full rounded-survey border border-rule px-3 py-2"
            >
              <option value="">Prefer not to say</option>
              {COUNTRY_CODES.map((c) => (
                <option key={c.alpha2} value={c.alpha2}>
                  {flagEmoji(c.alpha2)} {c.name}
                </option>
              ))}
            </select>
          </FormField>
          {preferredAddons.includes('VISA_ASSISTANCE') && (
            <p className="text-xs text-mist">
              Sharing your residence/citizenship helps our team scope visa assistance accurately.
            </p>
          )}
        </div>
      )}

      {step === 7 && (
        <FormField label="Special requests" htmlFor="specialRequests" optional>
          <textarea
            value={specialRequests}
            onChange={(e) => setSpecialRequests(e.target.value)}
            rows={2}
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
      )}

      {step === 8 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="First name" htmlFor="firstName">
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-survey border border-rule px-3 py-2"
              />
            </FormField>
            <FormField label="Last name" htmlFor="lastName">
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-survey border border-rule px-3 py-2"
              />
            </FormField>
          </div>
          <p className="text-xs text-mist">
            Keep your last name handy -- along with the booking reference we&apos;ll give you next, it&apos;s what we&apos;ll ask for
            any time you contact us about this trip.
          </p>
          <FormField label="Email" htmlFor="email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
          <div>
            <p className="mb-1 text-sm text-mist">Phone (so we can reach you about your trip)</p>
            <div className="flex gap-2">
              <select
                value={dialCode}
                onChange={(e) => setDialCode(e.target.value)}
                className="rounded-survey border border-rule px-2 py-2"
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={c.alpha2} value={c.dialCode}>
                    {flagEmoji(c.alpha2)} +{c.dialCode}
                  </option>
                ))}
              </select>
              <input
                type="tel"
                value={localNumber}
                onChange={(e) => setLocalNumber(e.target.value)}
                placeholder="81 234 5678"
                className="flex-1 rounded-survey border border-rule px-3 py-2"
              />
            </div>
          </div>
        </div>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex items-center gap-3">
        {step > 0 && (
          <Button type="button" variant="secondary" onClick={back} disabled={pending}>
            ← Back
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={next} disabled={!canAdvance}>
            Next
          </Button>
        ) : (
          <Button type="button" onClick={handleSubmit} disabled={pending || !canAdvance}>
            {pending ? 'Submitting…' : 'Request my quotation'}
          </Button>
        )}
      </div>
    </div>
  );
}

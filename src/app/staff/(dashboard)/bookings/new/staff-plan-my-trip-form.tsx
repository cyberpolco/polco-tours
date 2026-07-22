'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/Alert';
import { BackChevron } from '@/components/ui/BackLink';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Select } from '@/components/ui/Select';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { COUNTRY_CODES, flagEmoji } from '@lib/country-codes';
import { DESTINATION_SITES } from '@lib/destination-sites';
import { createStaffTailorMadeBookingAction } from './actions';

const TAGS = ['WILDLIFE', 'ADVENTURE', 'RELAXATION', 'FAMILY', 'CULTURE', 'LUXURY', 'BUDGET'] as const;

// Mirrors (guest)/plan-my-trip/plan-my-trip-form.tsx's local ADDON_CODES.
const ADDONS = ['PHOTOGRAPHY', 'VIDEOGRAPHY', 'TRANSLATOR', 'VISA_ASSISTANCE'] as const;

const DESTINATIONS = [
  { code: 'NA', label: '🇳🇦 Namibia' },
  { code: 'CD', label: '🇨🇩 DR Congo' },
  { code: 'ZM', label: '🇿🇲 Zambia' },
  { code: 'ZW', label: '🇿🇼 Zimbabwe' },
] as const;

// Staff copy of (guest)/plan-my-trip/plan-my-trip-form.tsx -- same 9 steps,
// same fields/labels/validation, so filling this out feels identical to the
// guest-facing wizard (explicit user direction). Two real differences from
// the guest version: (1) no anonymous-session-establish step, since ctx is
// already a real staff session; (2) no phone/dial-code field -- there's no
// permission-safe way for a TOUR_OPERATOR (who lacks admin.all) to write a
// phone number onto the client's own account the way the guest's own
// self-service authService.updateProfile call does, so this form only
// collects what CreateTailorMadeInput actually uses directly (email doubles
// as both the booking's contactEmail AND the staff lookup key, DR-036).
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

export default function StaffPlanMyTripForm() {
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

  const availableSites = useMemo(() => DESTINATION_SITES.filter((s) => countries.includes(s.country)), [countries]);

  const datesValid = customTravelStart !== '' && customTravelEnd !== '' && customTravelEnd >= customTravelStart;
  const canAdvance = [
    countries.length > 0,
    datesValid,
    seats >= 1,
    true,
    true,
    true,
    true,
    true,
    firstName.trim() !== '' && lastName.trim() !== '' && email.trim() !== '',
  ][step];

  function next() {
    if (step === 0 && countries.length > 0) {
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
      const result = await createStaffTailorMadeBookingAction({
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
      });
      if ('error' in result) {
        setError(result.error);
        return;
      }
      router.push(`/staff/bookings/${result.bookingId}`);
    } catch {
      setError('Something went wrong creating this request -- please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
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
            Sites the client would like to visit (pick any)
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
        <FormField label="Tell us about the trip the client has in mind" htmlFor="customDescription" optional>
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
            <p className="mb-2 text-sm text-mist">Add-ons the client might want (pick any)</p>
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
            <Select value={countryOfResidence} onChange={(e) => setCountryOfResidence(e.target.value)}>
              <option value="">Prefer not to say</option>
              {COUNTRY_CODES.map((c) => (
                <option key={c.alpha2} value={c.alpha2}>
                  {flagEmoji(c.alpha2)} {c.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Citizenship" htmlFor="citizenship" optional>
            <Select value={citizenship} onChange={(e) => setCitizenship(e.target.value)}>
              <option value="">Prefer not to say</option>
              {COUNTRY_CODES.map((c) => (
                <option key={c.alpha2} value={c.alpha2}>
                  {flagEmoji(c.alpha2)} {c.name}
                </option>
              ))}
            </Select>
          </FormField>
          {preferredAddons.includes('VISA_ASSISTANCE') && (
            <p className="text-xs text-mist">
              Residence/citizenship helps scope visa assistance accurately.
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
            <FormField label="Client first name" htmlFor="firstName">
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-survey border border-rule px-3 py-2"
              />
            </FormField>
            <FormField label="Client last name" htmlFor="lastName">
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-survey border border-rule px-3 py-2"
              />
            </FormField>
          </div>
          <FormField label="Client email (or the tour lead's email, for a group)" htmlFor="email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
        </div>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex items-center gap-3">
        {step > 0 && (
          <Button type="button" variant="secondary" onClick={back} disabled={pending} className="gap-1.5">
            <BackChevron />
            Back
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={next} disabled={!canAdvance}>
            Next
          </Button>
        ) : (
          <Button type="button" onClick={handleSubmit} disabled={pending || !canAdvance}>
            {pending ? 'Creating…' : 'Create request'}
          </Button>
        )}
      </div>
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { BackChevron } from '@/components/ui/BackLink';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Select } from '@/components/ui/Select';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { COUNTRY_CODES, flagEmoji, OPERATING_COUNTRY_CODES } from '@lib/country-codes';
import { createStaffTailorMadeBookingAction } from './actions';

// DR-167: gallery sites are now staff-managed (name/country, add/remove)
// from /staff/cms -- fetched server-side by bookings/new/page.tsx and
// passed down here, replacing the old static DESTINATION_SITES import.
interface StaffPlanMyTripSite {
  name: string;
  country: string;
}

const TAGS = ['WILDLIFE', 'ADVENTURE', 'RELAXATION', 'FAMILY', 'CULTURE', 'LUXURY', 'BUDGET'] as const;

// Mirrors (guest)/plan-my-trip/plan-my-trip-form.tsx's local ADDON_CODES.
const ADDONS = ['PHOTOGRAPHY', 'VIDEOGRAPHY', 'TRANSLATOR', 'VISA_ASSISTANCE'] as const;

const DESTINATION_CODES = OPERATING_COUNTRY_CODES;

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
function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

// BUDGET and LUXURY are contradictory trip preferences -- selecting one
// clears the other, in both directions.
const MUTUALLY_EXCLUSIVE_TAGS: Record<string, string> = { BUDGET: 'LUXURY', LUXURY: 'BUDGET' };

function toggleTag(list: string[], value: string): string[] {
  if (list.includes(value)) return list.filter((v) => v !== value);
  const opposite = MUTUALLY_EXCLUSIVE_TAGS[value];
  return [...list.filter((v) => v !== opposite), value];
}

export default function StaffPlanMyTripForm({ sites: allSites }: { sites: StaffPlanMyTripSite[] }) {
  const router = useRouter();
  const t = useTranslations('PlanMyTripForm');
  const tStaff = useTranslations('StaffPlanMyTripForm');
  const tSteps = useTranslations('PlanMyTripSteps');
  const tTags = useTranslations('TripTags');
  const tAddons = useTranslations('TripAddons');
  const tCountries = useTranslations('Countries');
  const tBookings = useTranslations('StaffBookings');
  const STEPS = [
    tSteps('destination'),
    tSteps('dates'),
    tSteps('travelers'),
    tSteps('preferences'),
    tSteps('sites'),
    tSteps('yourTrip'),
    tSteps('addOns'),
    tSteps('specialRequests'),
    tSteps('contact'),
  ];
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

  const availableSites = useMemo(() => allSites.filter((s) => countries.includes(s.country)), [allSites, countries]);

  const datesValid = customTravelStart !== '' && customTravelEnd !== '' && customTravelEnd >= customTravelStart;
  const canAdvance = [
    countries.length > 0,
    datesValid,
    seats >= 1,
    true, // preferences (tags) -- optional
    true, // sites -- optional
    true, // your trip (description) -- optional (DR-048)
    countryOfResidence !== '' && citizenship !== '', // add-ons -- optional; residence/citizenship required
    true, // special requests -- optional
    firstName.trim() !== '' && lastName.trim() !== '' && email.trim() !== '',
  ][step];

  function next() {
    if (step === 0 && countries.length > 0) {
      setSites((current) => current.filter((name) => allSites.some((s) => s.name === name && countries.includes(s.country))));
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
        countryOfResidence,
        citizenship,
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
      setError(tStaff('errorGeneric'));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      <StepIndicator steps={STEPS} currentIndex={step} />

      {step === 0 && (
        <div>
          <p className="mb-2 text-sm text-mist">{t('whichCountries')}</p>
          <div className="grid grid-cols-2 gap-2">
            {DESTINATION_CODES.map((code) => (
              <SelectableCard
                key={code}
                type="checkbox"
                checked={countries.includes(code)}
                onChange={() => setCountries((c) => toggle(c, code))}
              >
                {flagEmoji(code)} {tCountries(code)}
              </SelectableCard>
            ))}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="grid grid-cols-2 gap-4">
          <FormField label={t('travelStart')} htmlFor="customTravelStart">
            <input
              type="date"
              value={customTravelStart}
              onChange={(e) => setCustomTravelStart(e.target.value)}
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
          <FormField label={t('travelEnd')} htmlFor="customTravelEnd">
            <input
              type="date"
              value={customTravelEnd}
              onChange={(e) => setCustomTravelEnd(e.target.value)}
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
          {customTravelStart && customTravelEnd && !datesValid && (
            <p className="col-span-2 text-xs text-amber">{t('endBeforeStartError')}</p>
          )}
        </div>
      )}

      {step === 2 && (
        <FormField label={t('travelers')} htmlFor="seats">
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
          <p className="mb-2 text-sm text-mist">{t('whatMattersMost')}</p>
          <div className="grid grid-cols-2 gap-2">
            {TAGS.map((tag) => (
              <SelectableCard
                key={tag}
                type="checkbox"
                checked={tags.includes(tag)}
                onChange={() => setTags((tg) => toggleTag(tg, tag))}
              >
                {tTags(tag)}
              </SelectableCard>
            ))}
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          <p className="mb-2 text-sm text-mist">
            {tStaff('sitesToVisit')}
            {availableSites.length === 0 && t('goBackForSites')}
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
        <FormField label={tStaff('tellUsAboutTrip')} htmlFor="customDescription" optional>
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
            <p className="mb-2 text-sm text-mist">{tStaff('addonsClientMightWant')}</p>
            <div className="grid grid-cols-2 gap-2">
              {ADDONS.map((code) => (
                <SelectableCard
                  key={code}
                  type="checkbox"
                  checked={preferredAddons.includes(code)}
                  onChange={() => setPreferredAddons((a) => toggle(a, code))}
                >
                  {tAddons(code)}
                </SelectableCard>
              ))}
            </div>
          </div>
          <FormField label={t('countryOfResidence')} htmlFor="countryOfResidence">
            <Select value={countryOfResidence} onChange={(e) => setCountryOfResidence(e.target.value)} required>
              <option value="" disabled>
                {t('selectACountry')}
              </option>
              {COUNTRY_CODES.map((c) => (
                <option key={c.alpha2} value={c.alpha2}>
                  {flagEmoji(c.alpha2)} {c.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t('citizenship')} htmlFor="citizenship">
            <Select value={citizenship} onChange={(e) => setCitizenship(e.target.value)} required>
              <option value="" disabled>
                {t('selectACountry')}
              </option>
              {COUNTRY_CODES.map((c) => (
                <option key={c.alpha2} value={c.alpha2}>
                  {flagEmoji(c.alpha2)} {c.name}
                </option>
              ))}
            </Select>
          </FormField>
          <p className="text-xs text-mist">{tStaff('residenceCitizenshipNotice')}</p>
        </div>
      )}

      {step === 7 && (
        <FormField label={t('specialRequests')} htmlFor="specialRequests" optional>
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
            <FormField label={tStaff('clientFirstName')} htmlFor="firstName">
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-survey border border-rule px-3 py-2"
              />
            </FormField>
            <FormField label={tStaff('clientLastName')} htmlFor="lastName">
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-survey border border-rule px-3 py-2"
              />
            </FormField>
          </div>
          <FormField label={tBookings('clientEmailLabel')} htmlFor="email">
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
            {t('back')}
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={next} disabled={!canAdvance}>
            {t('next')}
          </Button>
        ) : (
          <Button type="button" onClick={handleSubmit} disabled={pending || !canAdvance}>
            {pending ? tStaff('creating') : tStaff('createRequest')}
          </Button>
        )}
      </div>
    </div>
  );
}

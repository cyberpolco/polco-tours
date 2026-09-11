'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { BackChevron, BackLink } from '@/components/ui/BackLink';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Select } from '@/components/ui/Select';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { StepIndicator, type StepIndicatorStepDetail } from '@/components/ui/StepIndicator';
import type { WizardStepIconKey } from '@/components/ui/wizard-step-icons';
import { authClient } from '@lib/auth-client';
import { COUNTRY_CODES_ALPHABETICAL, flagEmoji, OPERATING_COUNTRY_CODES } from '@lib/country-codes';
import { createPlanMyTripRequestAction, recordWizardStepAction } from './actions';

// Order-matched to STEPS below (destination -> contact) -- shares the
// 'travelers'/'addOns' icon keys with the direct-booking wizard's own
// checklist (booking-wizard-steps.ts), since those two concepts are the
// same across both journeys.
const STEP_ICON_KEYS: WizardStepIconKey[] = [
  'destination',
  'dates',
  'travelers',
  'preferences',
  'sites',
  'tripNotes',
  'addOns',
  'specialRequests',
  'contact',
];

// DR-167: gallery sites are now staff-managed (name/country, add/remove)
// from /staff/cms -- fetched server-side by plan-my-trip/page.tsx (the
// same list the Gallery page itself reads) and passed down here, replacing
// the old static DESTINATION_SITES import.
export interface PlanMyTripSite {
  name: string;
  country: string;
}

const TAGS = ['WILDLIFE', 'ADVENTURE', 'RELAXATION', 'FAMILY', 'CULTURE', 'LUXURY', 'BUDGET', 'CAMPING', 'ADRENALINE', 'BIRDWATCHING', 'HONEYMOON', 'SELF_DRIVE'] as const;

// Mirrors booking/domain.ts's local ADDON_CODES -- kept in sync by hand,
// same as that constant's own comment explains (catalog doesn't export a
// validating vocabulary for AddonCode yet, only PACKAGE_TAGS). Includes
// FLIGHT_TICKET/ESIM (DR-238) as plain interest picks, same as every other
// code here -- the priced/variant picker for these two only exists later,
// on a real booking's own add-ons step (DR-222).
const ADDONS = ['PHOTOGRAPHY', 'VIDEOGRAPHY', 'TRANSLATOR', 'VISA_ASSISTANCE', 'FLIGHT_TICKET', 'ESIM'] as const;

const DESTINATION_CODES = OPERATING_COUNTRY_CODES;

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function withNameAt(list: string[], index: number, value: string): string[] {
  const next = [...list];
  while (next.length <= index) next.push('');
  next[index] = value;
  return next;
}

// BUDGET and LUXURY are contradictory trip preferences -- selecting one
// clears the other, in both directions.
const MUTUALLY_EXCLUSIVE_TAGS: Record<string, string> = { BUDGET: 'LUXURY', LUXURY: 'BUDGET' };

function toggleTag(list: string[], value: string): string[] {
  if (list.includes(value)) return list.filter((v) => v !== value);
  const opposite = MUTUALLY_EXCLUSIVE_TAGS[value];
  return [...list.filter((v) => v !== opposite), value];
}

interface PlanMyTripFormProps {
  /** Pre-selected from the homepage map's country click (AfricaMap.tsx),
   * via plan-my-trip/page.tsx's ?destination= query param. */
  initialDestination?: string;
  /** Fetched server-side from the same staff-managed gallery-site list the
   * Gallery page reads (DR-167) -- already filtered to entries with a
   * name+country set. */
  sites: PlanMyTripSite[];
  /** DR-198: null when no rate is configured yet -- the live warning below
   * just doesn't render in that case (real enforcement is server-side
   * regardless, see bookingService.createTailorMadeRequest). */
  lateBookingRate: { thresholdDays: number; surchargeRateBp: number } | null;
}

// DR-198: preview-only mirror of computeLateBookingSurchargeBp's day-diff
// math (src/lib/late-booking-rate.ts) -- an empty dateString reads as
// "infinitely far out" (never late).
const MS_PER_DAY = 1000 * 60 * 60 * 24;
function daysUntil(dateString: string): number {
  if (!dateString) return Infinity;
  const target = new Date(`${dateString}T00:00:00Z`).getTime();
  return (target - Date.now()) / MS_PER_DAY;
}

export default function PlanMyTripForm({ initialDestination, sites: allSites, lateBookingRate }: PlanMyTripFormProps) {
  const router = useRouter();
  const t = useTranslations('PlanMyTripForm');
  const tSteps = useTranslations('PlanMyTripSteps');
  const tTags = useTranslations('TripTags');
  const tAddons = useTranslations('TripAddons');
  const tCountries = useTranslations('Countries');
  const STEP_KEYS = ['destination', 'dates', 'travelers', 'preferences', 'sites', 'yourTrip', 'addOns', 'specialRequests', 'contact'] as const;
  const STEPS: StepIndicatorStepDetail[] = STEP_KEYS.map((key, i) => ({
    label: tSteps(key),
    description: tSteps(`${key}Description`),
    iconKey: STEP_ICON_KEYS[i],
  }));
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Best-effort wizard-step-abandonment tracking (DR-155) -- fire-and-forget,
  // never awaited/surfaced, so a tracking hiccup can never affect the wizard.
  useEffect(() => {
    void recordWizardStepAction(step);
  }, [step]);

  const [countries, setCountries] = useState<string[]>(initialDestination ? [initialDestination] : []);
  const [customTravelStart, setCustomTravelStart] = useState('');
  const [customTravelEnd, setCustomTravelEnd] = useState('');
  const [seats, setSeats] = useState(1);
  // DR-271 (explicit user request): a name for every OTHER traveler in the
  // party -- entry i is "traveler i+2" (traveler 1 is the tour lead,
  // collected separately in the contact step below). Indices beyond
  // `seats - 1` are ignored/trimmed on submit, not eagerly spliced here, so
  // typing something and then lowering the seat count doesn't lose it if
  // the guest raises it again.
  const [coTravelerNames, setCoTravelerNames] = useState<string[]>([]);
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
  const availableSites = useMemo(() => allSites.filter((s) => countries.includes(s.country)), [allSites, countries]);

  const datesValid = customTravelStart !== '' && customTravelEnd !== '' && customTravelEnd >= customTravelStart;
  // DR-198: preview only -- the real decision is made server-side against
  // the actual submission moment (bookingService.createTailorMadeRequest).
  const isLateBooking = lateBookingRate ? daysUntil(customTravelStart) < lateBookingRate.thresholdDays : false;
  const neededCoTravelers = Math.max(0, seats - 1);
  const coTravelerNamesValid = Array.from({ length: neededCoTravelers }, (_, i) => coTravelerNames[i]?.trim()).every(
    (name) => !!name,
  );
  const canAdvance = [
    countries.length > 0,
    datesValid,
    seats >= 1 && coTravelerNamesValid,
    true, // preferences (tags) -- optional
    true, // sites -- optional
    true, // your trip (description) -- optional (DR-048)
    countryOfResidence !== '' && citizenship !== '', // add-ons -- optional; residence/citizenship required
    true, // special requests -- optional
    firstName.trim() !== '' && lastName.trim() !== '' && email.trim() !== '' && localNumber.trim() !== '',
  ][step];

  function next() {
    if (step === 0 && countries.length > 0) {
      // Drop any previously-picked site whose country is no longer selected.
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
      const session = await authClient.getSession();
      if (!session.data) {
        const { error: signInError } = await authClient.signIn.anonymous();
        if (signInError) {
          setError(signInError.message ?? t('errorCouldNotStart'));
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
        countryOfResidence,
        citizenship,
        specialRequests: specialRequests || undefined,
        firstName,
        lastName,
        email,
        dialCode,
        localNumber,
        coTravelerNames: coTravelerNames.slice(0, neededCoTravelers),
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
      setError(t('errorGeneric'));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Every later step already has a Back button (below, client-side
          state, nothing lost); step 0 has nowhere in-wizard to go back to,
          so it gets a real link out instead, same convention as the other
          wizards' entry-point back links. */}
      {step === 0 && <BackLink href="/">{t('backToHomepage')}</BackLink>}
      <StepIndicator steps={STEPS} currentIndex={step} variant="checklist" />

      {step === 0 && (
        <div>
          <p className="mb-2 text-sm text-mist">{t('whichCountries')}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {/* Explicit user request: alphabetical by the label actually
                shown, so the order is correct in both EN and FR rather than
                sorted once in a fixed language. */}
            {[...DESTINATION_CODES]
              .sort((a, b) => tCountries(a).localeCompare(tCountries(b)))
              .map((code) => (
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          {isLateBooking && lateBookingRate && (
            <div className="col-span-2">
              <Alert tone="info">
                {t('lateBookingNotice', {
                  days: lateBookingRate.thresholdDays,
                  percent: (lateBookingRate.surchargeRateBp / 100).toFixed(0),
                })}
              </Alert>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div>
            <p className="mb-1 text-sm text-mist">{t('travelers')}</p>
            {/* Explicit user request: a plain number input couldn't be
                edited on mobile (deleting the single starting digit to
                retype a new one is unreliable with a touch keyboard) --
                +/- buttons replace it everywhere, never going below 1. */}
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
                onClick={() => setSeats((s) => s + 1)}
                aria-label={t('increaseTravelers')}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-navy text-xl font-semibold text-navy transition-colors duration-200 hover:bg-navy hover:text-bone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bone"
              >
                +
              </button>
            </div>
          </div>
          {neededCoTravelers > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-mist">{t('coTravelerNamesHint')}</p>
              {Array.from({ length: neededCoTravelers }, (_, i) => (
                <FormField key={i} label={t('coTravelerNameLabel', { number: i + 2 })} htmlFor={`coTraveler-${i}`}>
                  <input
                    id={`coTraveler-${i}`}
                    value={coTravelerNames[i] ?? ''}
                    onChange={(e) => setCoTravelerNames((names) => withNameAt(names, i, e.target.value))}
                    autoComplete="off"
                    className="w-full rounded-survey border border-rule px-3 py-2"
                  />
                </FormField>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div>
          <p className="mb-2 text-sm text-mist">{t('whatMattersMost')}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
            {t('sitesToVisit')}
            {availableSites.length === 0 && t('goBackForSites')}
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {availableSites.map(({ name }) => (
              <SelectableCard key={name} type="checkbox" checked={sites.includes(name)} onChange={() => setSites((s) => toggle(s, name))}>
                {name}
              </SelectableCard>
            ))}
          </div>
        </div>
      )}

      {step === 5 && (
        <FormField label={t('tellUsAboutTrip')} htmlFor="customDescription" optional>
          <textarea
            value={customDescription}
            onChange={(e) => setCustomDescription(e.target.value)}
            rows={4}
            autoComplete="off"
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
      )}

      {step === 6 && (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm text-mist">{t('addonsYouMightWant')}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
              {COUNTRY_CODES_ALPHABETICAL.map((c) => (
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
              {COUNTRY_CODES_ALPHABETICAL.map((c) => (
                <option key={c.alpha2} value={c.alpha2}>
                  {flagEmoji(c.alpha2)} {c.name}
                </option>
              ))}
            </Select>
          </FormField>
          <p className="text-xs text-mist">{t('residenceCitizenshipNotice')}</p>
        </div>
      )}

      {step === 7 && (
        <FormField label={t('specialRequests')} htmlFor="specialRequests" optional>
          <textarea
            value={specialRequests}
            onChange={(e) => setSpecialRequests(e.target.value)}
            rows={2}
            autoComplete="off"
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
      )}

      {step === 8 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={t('firstName')} htmlFor="firstName">
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="off"
                className="w-full rounded-survey border border-rule px-3 py-2"
              />
            </FormField>
            <FormField label={t('lastName')} htmlFor="lastName">
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="off"
                className="w-full rounded-survey border border-rule px-3 py-2"
              />
            </FormField>
          </div>
          <p className="text-xs text-mist">{t('keepLastNameHandy')}</p>
          <FormField label={t('email')} htmlFor="email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
          <div>
            <p className="mb-1 text-sm text-mist">{t('phoneNotice')}</p>
            <div className="flex gap-2">
              <Select value={dialCode} onChange={(e) => setDialCode(e.target.value)}>
                {COUNTRY_CODES_ALPHABETICAL.map((c) => (
                  <option key={c.alpha2} value={c.dialCode}>
                    {flagEmoji(c.alpha2)} +{c.dialCode}
                  </option>
                ))}
              </Select>
              <input
                type="tel"
                value={localNumber}
                onChange={(e) => setLocalNumber(e.target.value)}
                autoComplete="off"
                placeholder={t('phonePlaceholder')}
                className="flex-1 rounded-survey border border-rule px-3 py-2"
              />
            </div>
          </div>
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
            {pending ? t('submitting') : t('requestQuotation')}
          </Button>
        )}
      </div>
    </div>
  );
}

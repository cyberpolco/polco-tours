'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Select } from '@/components/ui/Select';
import { authClient } from '@lib/auth-client';
import { COUNTRY_CODES, flagEmoji } from '@lib/country-codes';
import { createGuestPackageBookingAction } from './actions';

interface Props {
  packageId: string;
  durationDays: number;
  // DR-198: null when no rate is configured yet -- the live warning below
  // just doesn't render in that case (real enforcement is server-side
  // regardless, see bookingService.createHoldWithDates).
  lateBookingRate: { thresholdDays: number; surchargeRateBp: number } | null;
}

// Mirrors (guest)/book/[departureId]/booking-form.tsx -- same anonymous-
// session-then-Server-Action shape (see that file's own comment on why the
// FormData snapshot has to happen before any await). The only real
// difference: this collects the guest's own travel start date instead of a
// fixed departure's seat cap, since there's no pre-existing Departure to
// bound seats against (DR-054) -- capacity is created equal to whatever the
// guest requests. Trip length (durationDays) is staff-set on the package,
// not a guest choice, so there's no end-date input -- the real end date is
// computed server-side (catalogService.createDepartureForBooking); this
// component only echoes it back for the guest's own planning.
export default function BookingForm({ packageId, durationDays, lateBookingRate }: Props) {
  const router = useRouter();
  const t = useTranslations('BookingStart');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  // Display-only preview -- the authoritative end date is always computed
  // server-side (catalogService.createDepartureForBooking), this just
  // echoes the same trivial "start + (durationDays - 1)" arithmetic back so
  // the guest can see their expected return date before submitting.
  const previewReturnDate = startDate ? addDaysToDateString(startDate, durationDays - 1) : null;
  // DR-198: preview only -- the real decision is made server-side against
  // the actual booking-creation moment (bookingService.createHoldWithDates),
  // this just warns the guest before they submit.
  const isLateBooking = lateBookingRate ? daysUntil(startDate) < lateBookingRate.thresholdDays : false;

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
          setError(signInError.message ?? t('errorCouldNotStart'));
          return;
        }
      }

      const result = await createGuestPackageBookingAction(packageId, formData);
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
      <FormField label={t('travelStart')} htmlFor="startDate">
        <input
          name="startDate"
          type="date"
          min={today}
          required
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full rounded-survey border border-rule px-3 py-2"
        />
      </FormField>
      <p className="text-sm text-mist">
        {t('tripLengthNotice', { days: durationDays })}
        {previewReturnDate && t('returnDateNotice', { date: previewReturnDate })}
      </p>
      {isLateBooking && lateBookingRate && (
        <Alert tone="info">
          {t('lateBookingNotice', {
            days: lateBookingRate.thresholdDays,
            percent: (lateBookingRate.surchargeRateBp / 100).toFixed(0),
          })}
        </Alert>
      )}

      <FormField label={t('seats')} htmlFor="seats">
        <input
          name="seats"
          type="number"
          min={1}
          defaultValue={1}
          required
          className="w-full rounded-survey border border-rule px-3 py-2"
        />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label={t('firstName')} htmlFor="firstName">
          <input name="firstName" required className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label={t('lastName')} htmlFor="lastName">
          <input name="lastName" required className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
      </div>

      <div>
        <p className="mb-1 text-sm text-mist">{t('phoneNotice')}</p>
        <div className="flex gap-2">
          <Select name="dialCode" defaultValue="264">
            {COUNTRY_CODES.map((c) => (
              <option key={c.alpha2} value={c.dialCode}>
                {flagEmoji(c.alpha2)} +{c.dialCode}
              </option>
            ))}
          </Select>
          <input
            name="localNumber"
            type="tel"
            required
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

// Display-only preview matching catalogService's computeDepartureEndDate
// formula (start + extraDays calendar days) -- never the source of truth,
// just avoids a blank "your return date" while the guest is picking a start.
function addDaysToDateString(dateString: string, extraDays: number): string {
  const d = new Date(`${dateString}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + extraDays);
  return d.toISOString().slice(0, 10);
}

// DR-198: preview-only mirror of computeLateBookingSurchargeBp's day-diff
// math (src/lib/late-booking-rate.ts) -- an empty/unset dateString reads as
// "infinitely far out" (never late), same as the return-date preview above
// staying blank until a date is picked.
const MS_PER_DAY = 1000 * 60 * 60 * 24;
function daysUntil(dateString: string): number {
  if (!dateString) return Infinity;
  const target = new Date(`${dateString}T00:00:00Z`).getTime();
  return (target - Date.now()) / MS_PER_DAY;
}

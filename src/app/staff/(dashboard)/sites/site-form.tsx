'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { flagEmoji } from '@lib/country-codes';
import { PROVINCES_BY_COUNTRY, SITE_COUNTRIES, type SiteCountryCode } from '@lib/provinces';
import { FormField } from '@/components/ui/FormField';
import { MapLocationPicker } from '@/components/ui/MapLocationPicker';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';

interface SiteFormProps {
  action: (formData: FormData) => Promise<void>;
  defaultValues?: {
    name: string;
    country: string;
    province: string;
    city: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };
  submitLabel: string;
  pendingLabel: string;
}

// Country -> province cascading select, client-side (the only reason this
// form isn't a plain server-rendered one like the rest of this reference-
// data CRUD) -- province options depend on which country is picked.
// Country is restricted to SITE_COUNTRIES (this app's 4 operating
// countries, explicit user direction), not the full COUNTRY_CODES world
// list Hotel/Restaurant use -- so every possible selection always has a
// real province list, no free-text fallback needed.
export function SiteForm({ action, defaultValues, submitLabel, pendingLabel }: SiteFormProps) {
  const t = useTranslations('StaffSites');
  const tCountries = useTranslations('Countries');
  const [country, setCountry] = useState<SiteCountryCode | ''>((defaultValues?.country as SiteCountryCode) ?? '');
  const provinces = country ? PROVINCES_BY_COUNTRY[country] : [];

  return (
    <form action={action} className="space-y-4">
      <FormField label={t('name')} htmlFor="name">
        <input name="name" defaultValue={defaultValues?.name} required className="w-full rounded-survey border border-rule px-3 py-2" />
      </FormField>
      <FormField label={t('country')} htmlFor="country">
        <Select name="country" value={country} onChange={(e) => setCountry(e.target.value as SiteCountryCode)} required>
          <option value="" disabled>
            {t('selectACountry')}
          </option>
          {SITE_COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {flagEmoji(c.code)} {tCountries(c.code)}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label={t('province')} htmlFor="province">
        {/* Remounted on country change (key=country) so a province from a
            previously selected country never lingers as a stale value. */}
        <Select key={country} name="province" defaultValue={defaultValues?.province} required disabled={!country}>
          <option value="" disabled>
            {country ? t('selectAProvince') : t('selectACountryFirst')}
          </option>
          {provinces.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label={t('cityTown')} htmlFor="city" optional>
        <input name="city" defaultValue={defaultValues?.city ?? ''} className="w-full rounded-survey border border-rule px-3 py-2" />
      </FormField>
      <MapLocationPicker
        initialLatitude={defaultValues?.latitude ?? null}
        initialLongitude={defaultValues?.longitude ?? null}
        optional
      />
      <SubmitButton pendingLabel={pendingLabel}>{submitLabel}</SubmitButton>
    </form>
  );
}

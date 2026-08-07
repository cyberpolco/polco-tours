'use client';

import { useState } from 'react';
import { COUNTRY_CODES, flagEmoji } from '@lib/country-codes';
import { PROVINCES_BY_COUNTRY } from '@lib/provinces';
import { FormField } from '@/components/ui/FormField';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';

interface SiteFormProps {
  action: (formData: FormData) => Promise<void>;
  defaultValues?: { name: string; country: string; province: string; city: string | null };
  submitLabel: string;
  pendingLabel: string;
}

// Country -> province cascading select, client-side (the only reason this
// form isn't a plain server-rendered one like the rest of this reference-
// data CRUD) -- province options depend on which country is picked.
// Falls back to a free-text province input for any country outside the 4
// PROVINCES_BY_COUNTRY entries (this app's operating countries).
export function SiteForm({ action, defaultValues, submitLabel, pendingLabel }: SiteFormProps) {
  const [country, setCountry] = useState(defaultValues?.country ?? '');
  const provinces = PROVINCES_BY_COUNTRY[country] ?? [];

  return (
    <form action={action} className="space-y-4">
      <FormField label="Name" htmlFor="name">
        <input name="name" defaultValue={defaultValues?.name} required className="w-full rounded-survey border border-rule px-3 py-2" />
      </FormField>
      <FormField label="Country" htmlFor="country">
        <Select name="country" value={country} onChange={(e) => setCountry(e.target.value)} required>
          <option value="" disabled>
            Select a country
          </option>
          {COUNTRY_CODES.map((c) => (
            <option key={c.alpha2} value={c.alpha2}>
              {flagEmoji(c.alpha2)} {c.name}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Province" htmlFor="province">
        {provinces.length > 0 ? (
          // Remounted on country change (key=country) so a province from a
          // previously selected country never lingers as a stale value.
          <Select key={country} name="province" defaultValue={defaultValues?.province} required>
            <option value="" disabled>
              Select a province
            </option>
            {provinces.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        ) : (
          <input
            name="province"
            defaultValue={defaultValues?.province}
            required
            placeholder={country ? 'Enter a province/region' : 'Select a country first'}
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        )}
      </FormField>
      <FormField label="City / Town" htmlFor="city" optional>
        <input name="city" defaultValue={defaultValues?.city ?? ''} className="w-full rounded-survey border border-rule px-3 py-2" />
      </FormField>
      <SubmitButton pendingLabel={pendingLabel}>{submitLabel}</SubmitButton>
    </form>
  );
}

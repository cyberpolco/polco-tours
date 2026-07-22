import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { COUNTRY_CODES, flagEmoji } from '@lib/country-codes';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { createCountryRegulationAction } from './actions';

export default async function NewCountryRegulationPage() {
  const ctx = await requireStaffContext('country_regulation.write');
  if (!ctx.roles.includes('SUPERADMIN')) redirect('/staff/forbidden');

  return (
    <div className="max-w-2xl">
      <PageHeader eyebrow="Immigration · New country" title="Add country regulations" />
      <form action={createCountryRegulationAction} className="mt-6 space-y-4">
        <FormField label="Country" htmlFor="country">
          <Select name="country" required>
            {COUNTRY_CODES.map((c) => (
              <option key={c.alpha2} value={c.alpha2}>
                {flagEmoji(c.alpha2)} {c.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Visa requirements" htmlFor="visaRequirements">
          <textarea name="visaRequirements" required rows={3} className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label="Required documents" htmlFor="requiredDocuments">
          <textarea name="requiredDocuments" required rows={3} className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label="Processing time (days)" htmlFor="processingTimeDays" optional>
          <input name="processingTimeDays" type="number" min="0" className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label="Entry conditions" htmlFor="entryConditions">
          <textarea name="entryConditions" required rows={3} className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Immigration fee" htmlFor="fee" optional>
            <input name="fee" type="number" step="0.01" min="0" className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label="Fee currency" htmlFor="feeCurrency" optional>
            <Select name="feeCurrency">
              <option value="">—</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="NAD">NAD</option>
              <option value="CDF">CDF</option>
            </Select>
          </FormField>
        </div>
        <FormField label="Embassy name" htmlFor="embassyName" optional>
          <input name="embassyName" className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label="Embassy address" htmlFor="embassyAddress" optional>
          <input name="embassyAddress" className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Embassy phone" htmlFor="embassyPhone" optional>
            <input name="embassyPhone" className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label="Embassy email" htmlFor="embassyEmail" optional>
            <input name="embassyEmail" type="email" className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
        </div>
        <FormField label="Health requirements" htmlFor="healthRequirements">
          <textarea name="healthRequirements" required rows={3} className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label="Travel advisories" htmlFor="travelAdvisories" optional>
          <textarea name="travelAdvisories" rows={2} className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label="Special restrictions" htmlFor="specialRestrictions" optional>
          <textarea name="specialRestrictions" rows={2} className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <SubmitButton>Add country</SubmitButton>
      </form>
    </div>
  );
}

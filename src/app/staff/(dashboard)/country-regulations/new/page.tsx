import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
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
  const t = await getTranslations('StaffCountryRegulations');

  return (
    <div className="max-w-2xl">
      <PageHeader eyebrow={t('newEyebrow')} title={t('newTitle')} />
      <form action={createCountryRegulationAction} className="mt-6 space-y-4">
        <FormField label={t('country')} htmlFor="country">
          <Select name="country" required>
            {COUNTRY_CODES.map((c) => (
              <option key={c.alpha2} value={c.alpha2}>
                {flagEmoji(c.alpha2)} {c.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t('visaRequirements')} htmlFor="visaRequirements">
          <textarea name="visaRequirements" required rows={3} className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label={t('requiredDocuments')} htmlFor="requiredDocuments">
          <textarea name="requiredDocuments" required rows={3} className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label={t('processingTimeDaysLabel')} htmlFor="processingTimeDays" optional>
          <input name="processingTimeDays" type="number" min="0" className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label={t('entryConditions')} htmlFor="entryConditions">
          <textarea name="entryConditions" required rows={3} className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label={t('immigrationFee')} htmlFor="fee" optional>
            <input name="fee" type="number" step="0.01" min="0" className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label={t('feeCurrency')} htmlFor="feeCurrency" optional>
            <Select name="feeCurrency">
              <option value="">—</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="NAD">NAD</option>
              <option value="CDF">CDF</option>
            </Select>
          </FormField>
        </div>
        <FormField label={t('embassyName')} htmlFor="embassyName" optional>
          <input name="embassyName" className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label={t('embassyAddress')} htmlFor="embassyAddress" optional>
          <input name="embassyAddress" className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label={t('embassyPhone')} htmlFor="embassyPhone" optional>
            <input name="embassyPhone" className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label={t('embassyEmail')} htmlFor="embassyEmail" optional>
            <input name="embassyEmail" type="email" className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
        </div>
        <FormField label={t('healthRequirements')} htmlFor="healthRequirements">
          <textarea name="healthRequirements" required rows={3} className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label={t('travelAdvisories')} htmlFor="travelAdvisories" optional>
          <textarea name="travelAdvisories" rows={2} className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label={t('specialRestrictions')} htmlFor="specialRestrictions" optional>
          <textarea name="specialRestrictions" rows={2} className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <SubmitButton>{t('addCountrySubmit')}</SubmitButton>
      </form>
    </div>
  );
}

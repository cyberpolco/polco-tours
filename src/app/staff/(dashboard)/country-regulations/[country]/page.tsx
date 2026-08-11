import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { immigrationService } from '@modules/immigration';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { deleteCountryRegulationAction, updateCountryRegulationAction } from './actions';

interface Props {
  params: Promise<{ country: string }>;
}

// Read-only for anyone holding country_regulation.read (TOUR_OPERATOR,
// VISA_FACILITATOR, and both admin roles via wildcard) -- edit/delete
// controls only render for SUPERADMIN, since PLATFORM_ADMIN would otherwise
// see a form that 403s on submit (immigrationService's explicit
// isCountryRegulationWriter check excludes it despite passing the route's
// permission gate).
export default async function CountryRegulationDetailPage({ params }: Props) {
  const { country } = await params;
  const ctx = await requireStaffContext('country_regulation.read');
  const canWrite = ctx.roles.includes('SUPERADMIN');

  let regulation;
  try {
    regulation = await immigrationService.getRegulation(ctx, country);
  } catch {
    notFound();
  }
  const t = await getTranslations('StaffCountryRegulations');
  const tCountries = await getTranslations('Countries');

  if (!canWrite) {
    return (
      <div className="max-w-2xl space-y-6">
        <PageHeader eyebrow={t('eyebrow')} title={tCountries(regulation.country)} />
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-mist">{t('visaRequirements')}</dt>
            <dd className="whitespace-pre-wrap">{regulation.visaRequirements}</dd>
          </div>
          <div>
            <dt className="text-mist">{t('requiredDocuments')}</dt>
            <dd className="whitespace-pre-wrap">{regulation.requiredDocuments}</dd>
          </div>
          <div>
            <dt className="text-mist">{t('processingTime')}</dt>
            <dd>{regulation.processingTimeDays != null ? t('processingTimeDays', { days: regulation.processingTimeDays }) : '—'}</dd>
          </div>
          <div>
            <dt className="text-mist">{t('entryConditions')}</dt>
            <dd className="whitespace-pre-wrap">{regulation.entryConditions}</dd>
          </div>
          <div>
            <dt className="text-mist">{t('immigrationFee')}</dt>
            <dd>
              {regulation.immigrationFeeMinor != null
                ? `${(regulation.immigrationFeeMinor / 100).toFixed(2)} ${regulation.feeCurrency}`
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-mist">{t('embassy')}</dt>
            <dd>
              {regulation.embassyName ?? '—'}
              {regulation.embassyAddress ? `, ${regulation.embassyAddress}` : ''}
              {regulation.embassyPhone ? ` · ${regulation.embassyPhone}` : ''}
              {regulation.embassyEmail ? ` · ${regulation.embassyEmail}` : ''}
            </dd>
          </div>
          <div>
            <dt className="text-mist">{t('healthRequirements')}</dt>
            <dd className="whitespace-pre-wrap">{regulation.healthRequirements}</dd>
          </div>
          <div>
            <dt className="text-mist">{t('travelAdvisories')}</dt>
            <dd className="whitespace-pre-wrap">{regulation.travelAdvisories ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-mist">{t('specialRestrictions')}</dt>
            <dd className="whitespace-pre-wrap">{regulation.specialRestrictions ?? '—'}</dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-8">
      <PageHeader eyebrow={t('eyebrow')} title={tCountries(regulation.country)} />
      <form action={updateCountryRegulationAction.bind(null, regulation.country)} className="space-y-4">
        <FormField label={t('visaRequirements')} htmlFor="visaRequirements">
          <textarea
            name="visaRequirements"
            defaultValue={regulation.visaRequirements}
            required
            rows={3}
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <FormField label={t('requiredDocuments')} htmlFor="requiredDocuments">
          <textarea
            name="requiredDocuments"
            defaultValue={regulation.requiredDocuments}
            required
            rows={3}
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <FormField label={t('processingTimeDaysLabel')} htmlFor="processingTimeDays" optional>
          <input
            name="processingTimeDays"
            type="number"
            min="0"
            defaultValue={regulation.processingTimeDays ?? ''}
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <FormField label={t('entryConditions')} htmlFor="entryConditions">
          <textarea
            name="entryConditions"
            defaultValue={regulation.entryConditions}
            required
            rows={3}
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label={t('immigrationFee')} htmlFor="fee" optional>
            <input
              name="fee"
              type="number"
              step="0.01"
              min="0"
              defaultValue={regulation.immigrationFeeMinor != null ? (regulation.immigrationFeeMinor / 100).toFixed(2) : ''}
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
          <FormField label={t('feeCurrency')} htmlFor="feeCurrency" optional>
            <Select name="feeCurrency" defaultValue={regulation.feeCurrency ?? ''}>
              <option value="">—</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="NAD">NAD</option>
              <option value="CDF">CDF</option>
            </Select>
          </FormField>
        </div>
        <FormField label={t('embassyName')} htmlFor="embassyName" optional>
          <input name="embassyName" defaultValue={regulation.embassyName ?? ''} className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label={t('embassyAddress')} htmlFor="embassyAddress" optional>
          <input
            name="embassyAddress"
            defaultValue={regulation.embassyAddress ?? ''}
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label={t('embassyPhone')} htmlFor="embassyPhone" optional>
            <input
              name="embassyPhone"
              defaultValue={regulation.embassyPhone ?? ''}
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
          <FormField label={t('embassyEmail')} htmlFor="embassyEmail" optional>
            <input
              name="embassyEmail"
              type="email"
              defaultValue={regulation.embassyEmail ?? ''}
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
        </div>
        <FormField label={t('healthRequirements')} htmlFor="healthRequirements">
          <textarea
            name="healthRequirements"
            defaultValue={regulation.healthRequirements}
            required
            rows={3}
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <FormField label={t('travelAdvisories')} htmlFor="travelAdvisories" optional>
          <textarea
            name="travelAdvisories"
            defaultValue={regulation.travelAdvisories ?? ''}
            rows={2}
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <FormField label={t('specialRestrictions')} htmlFor="specialRestrictions" optional>
          <textarea
            name="specialRestrictions"
            defaultValue={regulation.specialRestrictions ?? ''}
            rows={2}
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <SubmitButton>{t('saveChanges')}</SubmitButton>
      </form>
      <form action={deleteCountryRegulationAction.bind(null, regulation.country)}>
        <SubmitButton
          variant="secondary"
          pendingLabel={t('removing')}
          confirmMessage={t('deleteConfirm')}
        >
          {t('deleteCountry')}
        </SubmitButton>
      </form>
    </div>
  );
}

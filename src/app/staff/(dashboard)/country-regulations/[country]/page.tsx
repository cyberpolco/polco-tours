import { notFound } from 'next/navigation';
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

  if (!canWrite) {
    return (
      <div className="max-w-2xl space-y-6">
        <PageHeader eyebrow="Immigration" title={regulation.country} />
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-mist">Visa requirements</dt>
            <dd className="whitespace-pre-wrap">{regulation.visaRequirements}</dd>
          </div>
          <div>
            <dt className="text-mist">Required documents</dt>
            <dd className="whitespace-pre-wrap">{regulation.requiredDocuments}</dd>
          </div>
          <div>
            <dt className="text-mist">Processing time</dt>
            <dd>{regulation.processingTimeDays != null ? `${regulation.processingTimeDays} days` : '—'}</dd>
          </div>
          <div>
            <dt className="text-mist">Entry conditions</dt>
            <dd className="whitespace-pre-wrap">{regulation.entryConditions}</dd>
          </div>
          <div>
            <dt className="text-mist">Immigration fee</dt>
            <dd>
              {regulation.immigrationFeeMinor != null
                ? `${(regulation.immigrationFeeMinor / 100).toFixed(2)} ${regulation.feeCurrency}`
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-mist">Embassy</dt>
            <dd>
              {regulation.embassyName ?? '—'}
              {regulation.embassyAddress ? `, ${regulation.embassyAddress}` : ''}
              {regulation.embassyPhone ? ` · ${regulation.embassyPhone}` : ''}
              {regulation.embassyEmail ? ` · ${regulation.embassyEmail}` : ''}
            </dd>
          </div>
          <div>
            <dt className="text-mist">Health requirements</dt>
            <dd className="whitespace-pre-wrap">{regulation.healthRequirements}</dd>
          </div>
          <div>
            <dt className="text-mist">Travel advisories</dt>
            <dd className="whitespace-pre-wrap">{regulation.travelAdvisories ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-mist">Special restrictions</dt>
            <dd className="whitespace-pre-wrap">{regulation.specialRestrictions ?? '—'}</dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-8">
      <PageHeader eyebrow="Immigration" title={regulation.country} />
      <form action={updateCountryRegulationAction.bind(null, regulation.country)} className="space-y-4">
        <FormField label="Visa requirements" htmlFor="visaRequirements">
          <textarea
            name="visaRequirements"
            defaultValue={regulation.visaRequirements}
            required
            rows={3}
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <FormField label="Required documents" htmlFor="requiredDocuments">
          <textarea
            name="requiredDocuments"
            defaultValue={regulation.requiredDocuments}
            required
            rows={3}
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <FormField label="Processing time (days)" htmlFor="processingTimeDays" optional>
          <input
            name="processingTimeDays"
            type="number"
            min="0"
            defaultValue={regulation.processingTimeDays ?? ''}
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <FormField label="Entry conditions" htmlFor="entryConditions">
          <textarea
            name="entryConditions"
            defaultValue={regulation.entryConditions}
            required
            rows={3}
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Immigration fee" htmlFor="fee" optional>
            <input
              name="fee"
              type="number"
              step="0.01"
              min="0"
              defaultValue={regulation.immigrationFeeMinor != null ? (regulation.immigrationFeeMinor / 100).toFixed(2) : ''}
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
          <FormField label="Fee currency" htmlFor="feeCurrency" optional>
            <Select name="feeCurrency" defaultValue={regulation.feeCurrency ?? ''}>
              <option value="">—</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="NAD">NAD</option>
              <option value="CDF">CDF</option>
            </Select>
          </FormField>
        </div>
        <FormField label="Embassy name" htmlFor="embassyName" optional>
          <input name="embassyName" defaultValue={regulation.embassyName ?? ''} className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label="Embassy address" htmlFor="embassyAddress" optional>
          <input
            name="embassyAddress"
            defaultValue={regulation.embassyAddress ?? ''}
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Embassy phone" htmlFor="embassyPhone" optional>
            <input
              name="embassyPhone"
              defaultValue={regulation.embassyPhone ?? ''}
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
          <FormField label="Embassy email" htmlFor="embassyEmail" optional>
            <input
              name="embassyEmail"
              type="email"
              defaultValue={regulation.embassyEmail ?? ''}
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
        </div>
        <FormField label="Health requirements" htmlFor="healthRequirements">
          <textarea
            name="healthRequirements"
            defaultValue={regulation.healthRequirements}
            required
            rows={3}
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <FormField label="Travel advisories" htmlFor="travelAdvisories" optional>
          <textarea
            name="travelAdvisories"
            defaultValue={regulation.travelAdvisories ?? ''}
            rows={2}
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <FormField label="Special restrictions" htmlFor="specialRestrictions" optional>
          <textarea
            name="specialRestrictions"
            defaultValue={regulation.specialRestrictions ?? ''}
            rows={2}
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <SubmitButton>Save changes</SubmitButton>
      </form>
      <form action={deleteCountryRegulationAction.bind(null, regulation.country)}>
        <SubmitButton variant="secondary" pendingLabel="Removing…">
          Delete country
        </SubmitButton>
      </form>
    </div>
  );
}

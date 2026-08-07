import { requireStaffContext } from '@lib/staff-guard';
import { COUNTRY_CODES, flagEmoji } from '@lib/country-codes';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { createSiteAction } from './actions';

export default async function NewSitePage() {
  await requireStaffContext('itinerary.write');

  return (
    <div className="max-w-md">
      <PageHeader eyebrow="Itinerary Management · New site" title="Add a site" />
      <form action={createSiteAction} className="mt-6 space-y-4">
        <FormField label="Name" htmlFor="name">
          <input name="name" required className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label="Country" htmlFor="country">
          <Select name="country" required>
            {COUNTRY_CODES.map((c) => (
              <option key={c.alpha2} value={c.alpha2}>
                {flagEmoji(c.alpha2)} {c.name}
              </option>
            ))}
          </Select>
        </FormField>
        <SubmitButton>Add site</SubmitButton>
      </form>
    </div>
  );
}

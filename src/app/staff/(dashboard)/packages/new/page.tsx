import { requireStaffContext } from '@lib/staff-guard';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { createPackageAction } from './actions';

const PACKAGE_TAGS = ['WILDLIFE', 'ADVENTURE', 'RELAXATION', 'FAMILY', 'CULTURE', 'LUXURY', 'BUDGET'] as const;

export default async function NewPackagePage() {
  await requireStaffContext('catalog.write');

  return (
    <div className="max-w-md">
      <PageHeader eyebrow="Packages · New" title="Create a package" />
      <form action={createPackageAction} className="mt-6 space-y-4">
        <FormField label="Title" htmlFor="title">
          <input name="title" required className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label="Description" htmlFor="description">
          <textarea name="description" required rows={4} className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label="Country" htmlFor="country">
          <select name="country" required className="w-full rounded-survey border border-rule px-3 py-2">
            <option value="NA">🇳🇦 Namibia</option>
            <option value="CD">🇨🇩 DR Congo</option>
            <option value="ZM">🇿🇲 Zambia</option>
            <option value="ZW">🇿🇼 Zimbabwe</option>
          </select>
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Price per seat" htmlFor="amount">
            <input name="amount" type="number" step="0.01" min="0" required className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label="Currency" htmlFor="currency">
            <select name="currency" required className="w-full rounded-survey border border-rule px-3 py-2">
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="NAD">NAD</option>
              <option value="CDF">CDF</option>
            </select>
          </FormField>
        </div>
        <FormField label="Duration (days)" htmlFor="durationDays" optional>
          <input name="durationDays" type="number" min={1} className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <div>
          <p className="mb-1 text-sm text-mist">Tags</p>
          <div className="flex flex-wrap gap-2">
            {PACKAGE_TAGS.map((tag) => (
              <SelectableCard key={tag} type="checkbox" name="tags" value={tag}>
                {tag}
              </SelectableCard>
            ))}
          </div>
        </div>
        <SubmitButton>Create package</SubmitButton>
      </form>
    </div>
  );
}

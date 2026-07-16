import { requireStaffContext } from '@lib/staff-guard';
import { Alert } from '@/components/ui/Alert';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { createGuideProfileAction } from './actions';

interface Props {
  searchParams: Promise<{ error?: string }>;
}

export default async function NewGuidePage({ searchParams }: Props) {
  await requireStaffContext('fleet.write');
  const { error } = await searchParams;

  return (
    <div className="max-w-md">
      <PageHeader eyebrow="Fleet · New guide" title="Add a guide profile" />
      {error === 'guide_not_found' && (
        <div className="mt-3">
          <Alert tone="error">No TOUR_GUIDE-role account found for that email.</Alert>
        </div>
      )}
      <form action={createGuideProfileAction} className="mt-6 space-y-4">
        <FormField label="Guide's account email" htmlFor="email">
          <input name="email" type="email" required className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label="Languages (ISO-639-1 codes, comma-separated, e.g. en, fr)" htmlFor="languages" optional>
          <input name="languages" placeholder="en, fr" className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label="Specialties (comma-separated, e.g. wildlife, cultural)" htmlFor="specialties" optional>
          <input
            name="specialties"
            placeholder="wildlife, gorilla trekking"
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <SubmitButton>Add guide</SubmitButton>
      </form>
    </div>
  );
}

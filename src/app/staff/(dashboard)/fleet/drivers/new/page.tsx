import { requireStaffContext } from '@lib/staff-guard';
import { Alert } from '@/components/ui/Alert';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { createDriverProfileAction } from './actions';

interface Props {
  searchParams: Promise<{ error?: string }>;
}

export default async function NewDriverPage({ searchParams }: Props) {
  await requireStaffContext('fleet.write');
  const { error } = await searchParams;

  return (
    <div className="max-w-md">
      <PageHeader eyebrow="Fleet · New driver" title="Add a driver profile" />
      {error === 'driver_not_found' && (
        <div className="mt-3">
          <Alert tone="error">No DRIVER-role account found for that email.</Alert>
        </div>
      )}
      <form action={createDriverProfileAction} className="mt-6 space-y-4">
        <FormField label="Driver's account email" htmlFor="email">
          <input name="email" type="email" required className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label="License number" htmlFor="licenseNumber">
          <input name="licenseNumber" required className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label="License expires on" htmlFor="licenseExpiresAt" optional>
          <input name="licenseExpiresAt" type="date" className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <SubmitButton>Add driver</SubmitButton>
      </form>
    </div>
  );
}

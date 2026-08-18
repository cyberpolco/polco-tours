import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { Alert } from '@/components/ui/Alert';
import { BackLink } from '@/components/ui/BackLink';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Reveal } from '@/components/ui/Reveal';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { createDriverProfileAction } from './actions';

interface Props {
  searchParams: Promise<{ error?: string }>;
}

export default async function NewDriverPage({ searchParams }: Props) {
  await requireStaffContext('fleet.write');
  const { error } = await searchParams;
  const t = await getTranslations('StaffDrivers');

  return (
    <div className="max-w-md">
      <BackLink href="/staff/fleet/drivers">{t('backToFleet')}</BackLink>
      <PageHeader eyebrow={t('newEyebrow')} title={t('newTitle')} />
      {error === 'driver_not_found' && (
        <div className="mt-3">
          <Alert tone="error">{t('driverNotFound')}</Alert>
        </div>
      )}
      <Reveal>
        <form action={createDriverProfileAction} className="mt-6 space-y-4">
          <FormField label={t('accountEmail')} htmlFor="email">
            <input name="email" type="email" required className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label={t('licenseNumberLabel')} htmlFor="licenseNumber">
            <input name="licenseNumber" required className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label={t('licenseExpiresOn')} htmlFor="licenseExpiresAt" optional>
            <input name="licenseExpiresAt" type="date" className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <SubmitButton>{t('addDriverSubmit')}</SubmitButton>
        </form>
      </Reveal>
    </div>
  );
}

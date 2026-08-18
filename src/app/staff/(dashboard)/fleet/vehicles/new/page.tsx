import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { VEHICLE_TYPES } from '@lib/vehicle-catalog';
import { Alert } from '@/components/ui/Alert';
import { BackLink } from '@/components/ui/BackLink';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Reveal } from '@/components/ui/Reveal';
import { SelectOrOther } from '@/components/ui/SelectOrOther';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { createVehicleAction } from './actions';
import { VehicleMakeModelFields } from '../vehicle-make-model-fields';

interface Props {
  searchParams: Promise<{ error?: string }>;
}

export default async function NewVehiclePage({ searchParams }: Props) {
  await requireStaffContext('fleet.write');
  const { error } = await searchParams;
  const t = await getTranslations('StaffVehicles');

  return (
    <div className="max-w-md">
      <BackLink href="/staff/fleet/vehicles">{t('backToFleet')}</BackLink>
      <PageHeader eyebrow={t('newEyebrow')} title={t('newTitle')} />
      {error === 'owner_not_found' && (
        <div className="mt-3">
          <Alert tone="error">{t('ownerNotFound')}</Alert>
        </div>
      )}
      <Reveal>
        <form action={createVehicleAction} className="mt-6 space-y-4">
          <FormField label={t('plateNumber')} htmlFor="plateNumber">
            <input name="plateNumber" required className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <VehicleMakeModelFields />
          <div className="grid grid-cols-2 gap-4">
            <FormField label={t('type')} htmlFor="vehicleType">
              <SelectOrOther name="vehicleType" options={VEHICLE_TYPES} placeholder={t('vehicleTypePlaceholder')} required />
            </FormField>
            <FormField label={t('year')} htmlFor="year" optional>
              <input name="year" type="number" className="w-full rounded-survey border border-rule px-3 py-2" />
            </FormField>
          </div>
          <FormField label={t('seatCapacity')} htmlFor="seatCapacity">
            <input name="seatCapacity" type="number" min={1} required className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label={t('ownerEmailLabel')} htmlFor="ownerEmail" optional>
            <input name="ownerEmail" type="email" className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <SubmitButton>{t('registerVehicle')}</SubmitButton>
        </form>
      </Reveal>
    </div>
  );
}

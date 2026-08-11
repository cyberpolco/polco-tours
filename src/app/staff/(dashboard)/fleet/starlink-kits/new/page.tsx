import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { fleetService } from '@modules/fleet';
import { BackLink } from '@/components/ui/BackLink';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { createStarlinkKitAction } from './actions';

export default async function NewStarlinkKitPage() {
  const ctx = await requireStaffContext('fleet.write');
  const vehicles = await fleetService.listVehicles(ctx);
  const t = await getTranslations('StaffStarlinkKits');

  return (
    <div className="max-w-md">
      <BackLink href="/staff/fleet/starlink-kits">{t('backToFleet')}</BackLink>
      <PageHeader eyebrow={t('newEyebrow')} title={t('newTitle')} />
      <form action={createStarlinkKitAction} className="mt-6 space-y-4">
        <FormField label={t('kitIdLabel')} htmlFor="kitId">
          <input name="kitId" required className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label={t('assignToVehicle')} htmlFor="vehicleId" optional>
          <Select name="vehicleId">
            <option value="">{t('unassigned')}</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.make} {v.model} ({v.plateNumber})
              </option>
            ))}
          </Select>
        </FormField>
        <SubmitButton>{t('registerKit')}</SubmitButton>
      </form>
    </div>
  );
}

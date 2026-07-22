import { requireStaffContext } from '@lib/staff-guard';
import { fleetService } from '@modules/fleet';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { createStarlinkKitAction } from './actions';

export default async function NewStarlinkKitPage() {
  const ctx = await requireStaffContext('fleet.write');
  const vehicles = await fleetService.listVehicles(ctx);

  return (
    <div className="max-w-md">
      <PageHeader eyebrow="Fleet · New Starlink kit" title="Register a Starlink kit" />
      <form action={createStarlinkKitAction} className="mt-6 space-y-4">
        <FormField label="Kit ID (Starlink's own serial)" htmlFor="kitId">
          <input name="kitId" required className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label="Assign to vehicle" htmlFor="vehicleId" optional>
          <Select name="vehicleId">
            <option value="">Unassigned</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.make} {v.model} ({v.plateNumber})
              </option>
            ))}
          </Select>
        </FormField>
        <SubmitButton>Register kit</SubmitButton>
      </form>
    </div>
  );
}

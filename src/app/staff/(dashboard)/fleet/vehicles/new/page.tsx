import { requireStaffContext } from '@lib/staff-guard';
import { Alert } from '@/components/ui/Alert';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { createVehicleAction } from './actions';

interface Props {
  searchParams: Promise<{ error?: string }>;
}

export default async function NewVehiclePage({ searchParams }: Props) {
  await requireStaffContext('fleet.write');
  const { error } = await searchParams;

  return (
    <div className="max-w-md">
      <PageHeader eyebrow="Fleet · New vehicle" title="Register a vehicle" />
      {error === 'owner_not_found' && (
        <div className="mt-3">
          <Alert tone="error">
            No VEHICLE_OWNER account found for that email. Leave the field blank for an operator-owned vehicle.
          </Alert>
        </div>
      )}
      <form action={createVehicleAction} className="mt-6 space-y-4">
        <FormField label="Plate number" htmlFor="plateNumber">
          <input name="plateNumber" required className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Make" htmlFor="make">
            <input name="make" required className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label="Model" htmlFor="model">
            <input name="model" required className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Type" htmlFor="vehicleType">
            <input
              name="vehicleType"
              placeholder="minibus, 4x4, sedan..."
              required
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
          <FormField label="Year" htmlFor="year" optional>
            <input name="year" type="number" className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
        </div>
        <FormField label="Seat capacity" htmlFor="seatCapacity">
          <input name="seatCapacity" type="number" min={1} required className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label="Owner email (VEHICLE_OWNER account; leave blank if operator-owned)" htmlFor="ownerEmail" optional>
          <input name="ownerEmail" type="email" className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <SubmitButton>Register vehicle</SubmitButton>
      </form>
    </div>
  );
}

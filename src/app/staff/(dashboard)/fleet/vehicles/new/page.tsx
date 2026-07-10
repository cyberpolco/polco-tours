import { requireStaffContext } from '@lib/staff-guard';
import { createVehicleAction } from './actions';

interface Props {
  searchParams: Promise<{ error?: string }>;
}

export default async function NewVehiclePage({ searchParams }: Props) {
  await requireStaffContext('fleet.write');
  const { error } = await searchParams;

  return (
    <div className="max-w-md">
      <p className="text-xs tracking-survey text-mist">FLEET · NEW VEHICLE</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">Register a vehicle</h1>
      {error === 'owner_not_found' && (
        <p className="mt-3 text-sm text-amber">
          No VEHICLE_OWNER account found for that email. Leave the field blank for an operator-owned vehicle.
        </p>
      )}
      <form action={createVehicleAction} className="mt-6 space-y-4">
        <div>
          <label htmlFor="plateNumber" className="mb-1 block text-sm text-mist">
            Plate number
          </label>
          <input
            id="plateNumber"
            name="plateNumber"
            required
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="make" className="mb-1 block text-sm text-mist">
              Make
            </label>
            <input id="make" name="make" required className="w-full rounded-survey border border-rule px-3 py-2" />
          </div>
          <div>
            <label htmlFor="model" className="mb-1 block text-sm text-mist">
              Model
            </label>
            <input id="model" name="model" required className="w-full rounded-survey border border-rule px-3 py-2" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="vehicleType" className="mb-1 block text-sm text-mist">
              Type
            </label>
            <input
              id="vehicleType"
              name="vehicleType"
              placeholder="minibus, 4x4, sedan..."
              required
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="year" className="mb-1 block text-sm text-mist">
              Year
            </label>
            <input id="year" name="year" type="number" className="w-full rounded-survey border border-rule px-3 py-2" />
          </div>
        </div>
        <div>
          <label htmlFor="seatCapacity" className="mb-1 block text-sm text-mist">
            Seat capacity
          </label>
          <input
            id="seatCapacity"
            name="seatCapacity"
            type="number"
            min={1}
            required
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="ownerEmail" className="mb-1 block text-sm text-mist">
            Owner email (optional -- VEHICLE_OWNER account; leave blank if operator-owned)
          </label>
          <input
            id="ownerEmail"
            name="ownerEmail"
            type="email"
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </div>
        <button type="submit" className="rounded-survey bg-amber px-4 py-2 text-sm font-semibold text-navy">
          Register vehicle
        </button>
      </form>
    </div>
  );
}

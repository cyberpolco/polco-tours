import { requireStaffContext } from '@lib/staff-guard';
import { createDriverProfileAction } from './actions';

interface Props {
  searchParams: Promise<{ error?: string }>;
}

export default async function NewDriverPage({ searchParams }: Props) {
  await requireStaffContext('fleet.write');
  const { error } = await searchParams;

  return (
    <div className="max-w-md">
      <p className="text-xs tracking-survey text-mist">FLEET · NEW DRIVER</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">Add a driver profile</h1>
      {error === 'driver_not_found' && (
        <p className="mt-3 text-sm text-amber">No DRIVER-role account found for that email.</p>
      )}
      <form action={createDriverProfileAction} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm text-mist">
            Driver&apos;s account email
          </label>
          <input id="email" name="email" type="email" required className="w-full rounded-survey border border-rule px-3 py-2" />
        </div>
        <div>
          <label htmlFor="licenseNumber" className="mb-1 block text-sm text-mist">
            License number
          </label>
          <input
            id="licenseNumber"
            name="licenseNumber"
            required
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="licenseExpiresAt" className="mb-1 block text-sm text-mist">
            License expires on
          </label>
          <input
            id="licenseExpiresAt"
            name="licenseExpiresAt"
            type="date"
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </div>
        <button type="submit" className="rounded-survey bg-amber px-4 py-2 text-sm font-semibold text-navy">
          Add driver
        </button>
      </form>
    </div>
  );
}

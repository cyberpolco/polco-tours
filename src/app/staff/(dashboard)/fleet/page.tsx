import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { authService } from '@modules/auth';
import { fleetService } from '@modules/fleet';

export default async function FleetPage() {
  const ctx = await requireStaffContext('fleet.read');
  const [vehicles, drivers] = await Promise.all([fleetService.listVehicles(ctx), fleetService.listDriverProfiles(ctx)]);
  const driverUsers = await Promise.all(drivers.map((d) => authService.getUser(d.userId)));

  return (
    <div className="space-y-10">
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-navy">Vehicles</h1>
          <Link href="/staff/fleet/vehicles/new" className="rounded-survey bg-amber px-4 py-2 text-sm font-semibold text-navy">
            Add vehicle
          </Link>
        </div>
        {vehicles.length === 0 ? (
          <p className="mt-4 text-mist">No vehicles registered yet.</p>
        ) : (
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-rule text-mist">
                <th className="py-2">Plate</th>
                <th className="py-2">Make / model</th>
                <th className="py-2">Type</th>
                <th className="py-2">Seats</th>
                <th className="py-2">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id} className="border-b border-rule">
                  <td className="py-2">{v.plateNumber}</td>
                  <td className="py-2">
                    {v.make} {v.model}
                  </td>
                  <td className="py-2">{v.vehicleType}</td>
                  <td className="py-2">{v.seatCapacity}</td>
                  <td className="py-2">{v.status}</td>
                  <td className="py-2">
                    <Link href={`/staff/fleet/vehicles/${v.id}`} className="text-forest hover:underline">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-navy">Drivers</h1>
          <Link href="/staff/fleet/drivers/new" className="rounded-survey bg-amber px-4 py-2 text-sm font-semibold text-navy">
            Add driver
          </Link>
        </div>
        {drivers.length === 0 ? (
          <p className="mt-4 text-mist">No driver profiles yet.</p>
        ) : (
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-rule text-mist">
                <th className="py-2">Name</th>
                <th className="py-2">Email</th>
                <th className="py-2">License #</th>
                <th className="py-2">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {drivers.map((d, i) => (
                <tr key={d.id} className="border-b border-rule">
                  <td className="py-2">{driverUsers[i]?.name ?? '—'}</td>
                  <td className="py-2">{driverUsers[i]?.email ?? '—'}</td>
                  <td className="py-2">{d.licenseNumber}</td>
                  <td className="py-2">{d.status}</td>
                  <td className="py-2">
                    <Link href={`/staff/fleet/drivers/${d.id}`} className="text-forest hover:underline">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

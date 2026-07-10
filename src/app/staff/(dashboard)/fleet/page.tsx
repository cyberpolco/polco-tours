import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { authService } from '@modules/auth';
import { fleetService } from '@modules/fleet';
import { Badge } from '@/components/ui/Badge';
import { LinkButton } from '@/components/ui/Button';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { DRIVER_STATUS_TONE, VEHICLE_STATUS_TONE } from '@lib/status-tones';

export default async function FleetPage() {
  const ctx = await requireStaffContext('fleet.read');
  const [vehicles, drivers] = await Promise.all([fleetService.listVehicles(ctx), fleetService.listDriverProfiles(ctx)]);
  const driverUsers = await Promise.all(drivers.map((d) => authService.getUser(d.userId)));

  return (
    <div className="space-y-10">
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-navy">Vehicles</h1>
          <LinkButton href="/staff/fleet/vehicles/new">Add vehicle</LinkButton>
        </div>
        {vehicles.length === 0 ? (
          <p className="mt-4 text-mist">No vehicles registered yet.</p>
        ) : (
          <Table className="mt-4">
            <thead>
              <TableHeaderRow>
                <Th>Plate</Th>
                <Th>Make / model</Th>
                <Th>Type</Th>
                <Th>Seats</Th>
                <Th>Status</Th>
                <Th />
              </TableHeaderRow>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <Tr key={v.id}>
                  <Td>{v.plateNumber}</Td>
                  <Td>
                    {v.make} {v.model}
                  </Td>
                  <Td>{v.vehicleType}</Td>
                  <Td>{v.seatCapacity}</Td>
                  <Td>
                    <Badge tone={VEHICLE_STATUS_TONE[v.status]}>{v.status}</Badge>
                  </Td>
                  <Td>
                    <Link href={`/staff/fleet/vehicles/${v.id}`} className="text-forest hover:underline">
                      View
                    </Link>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-navy">Drivers</h1>
          <LinkButton href="/staff/fleet/drivers/new">Add driver</LinkButton>
        </div>
        {drivers.length === 0 ? (
          <p className="mt-4 text-mist">No driver profiles yet.</p>
        ) : (
          <Table className="mt-4">
            <thead>
              <TableHeaderRow>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>License #</Th>
                <Th>Status</Th>
                <Th />
              </TableHeaderRow>
            </thead>
            <tbody>
              {drivers.map((d, i) => (
                <Tr key={d.id}>
                  <Td>{driverUsers[i]?.name ?? '—'}</Td>
                  <Td>{driverUsers[i]?.email ?? '—'}</Td>
                  <Td>{d.licenseNumber}</Td>
                  <Td>
                    <Badge tone={DRIVER_STATUS_TONE[d.status]}>{d.status}</Badge>
                  </Td>
                  <Td>
                    <Link href={`/staff/fleet/drivers/${d.id}`} className="text-forest hover:underline">
                      View
                    </Link>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  );
}

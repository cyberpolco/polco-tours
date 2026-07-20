import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { authService } from '@modules/auth';
import { fleetService } from '@modules/fleet';
import { Badge } from '@/components/ui/Badge';
import { LinkButton } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { DRIVER_STATUS_TONE, GUIDE_STATUS_TONE, STARLINK_STATUS_TONE, VEHICLE_STATUS_TONE } from '@lib/status-tones';
import { deleteVehicleAction } from './vehicles/[vehicleId]/actions';
import { deleteDriverProfileAction } from './drivers/[driverProfileId]/actions';
import { deleteGuideProfileAction } from './guides/[guideProfileId]/actions';

export default async function FleetPage() {
  const ctx = await requireStaffContext('fleet.read');
  const [vehicles, drivers, guides, starlinkKits] = await Promise.all([
    fleetService.listVehicles(ctx),
    fleetService.listDriverProfiles(ctx),
    fleetService.listGuideProfiles(ctx),
    fleetService.listStarlinkKits(ctx),
  ]);
  const driverUsers = await Promise.all(drivers.map((d) => authService.getUser(d.userId)));
  const guideUsers = await Promise.all(guides.map((g) => authService.getUser(g.userId)));
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

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
                    <div className="flex items-center gap-3">
                      <Link href={`/staff/fleet/vehicles/${v.id}`} className="text-forest hover:underline">
                        View
                      </Link>
                      {/* DR-059: SUPERADMIN-only -- see the vehicle detail
                          page's own comment on why this role check (not just
                          the route's fleet.delete permission) is the real
                          gate for rendering the control at all. */}
                      {ctx.roles.includes('SUPERADMIN') && (
                        <form action={deleteVehicleAction.bind(null, v.id)}>
                          <SubmitButton variant="secondary" size="compact" pendingLabel="Deleting…">
                            Delete
                          </SubmitButton>
                        </form>
                      )}
                    </div>
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
                    <div className="flex items-center gap-3">
                      <Link href={`/staff/fleet/drivers/${d.id}`} className="text-forest hover:underline">
                        View
                      </Link>
                      {ctx.roles.includes('SUPERADMIN') && (
                        <form action={deleteDriverProfileAction.bind(null, d.id)}>
                          <SubmitButton variant="secondary" size="compact" pendingLabel="Deleting…">
                            Delete
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-navy">Guides</h1>
          <LinkButton href="/staff/fleet/guides/new">Add guide</LinkButton>
        </div>
        {guides.length === 0 ? (
          <p className="mt-4 text-mist">No guide profiles yet.</p>
        ) : (
          <Table className="mt-4">
            <thead>
              <TableHeaderRow>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Languages</Th>
                <Th>Specialties</Th>
                <Th>Status</Th>
                <Th />
              </TableHeaderRow>
            </thead>
            <tbody>
              {guides.map((g, i) => (
                <Tr key={g.id}>
                  <Td>{guideUsers[i]?.name ?? '—'}</Td>
                  <Td>{guideUsers[i]?.email ?? '—'}</Td>
                  <Td>{g.languages.join(', ') || '—'}</Td>
                  <Td>{g.specialties.join(', ') || '—'}</Td>
                  <Td>
                    <Badge tone={GUIDE_STATUS_TONE[g.status]}>{g.status}</Badge>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Link href={`/staff/fleet/guides/${g.id}`} className="text-forest hover:underline">
                        View
                      </Link>
                      {ctx.roles.includes('SUPERADMIN') && (
                        <form action={deleteGuideProfileAction.bind(null, g.id)}>
                          <SubmitButton variant="secondary" size="compact" pendingLabel="Deleting…">
                            Delete
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-navy">Starlink Kits</h1>
          <LinkButton href="/staff/fleet/starlink-kits/new">Add kit</LinkButton>
        </div>
        {starlinkKits.length === 0 ? (
          <p className="mt-4 text-mist">No Starlink kits registered yet.</p>
        ) : (
          <Table className="mt-4">
            <thead>
              <TableHeaderRow>
                <Th>Kit ID</Th>
                <Th>Status</Th>
                <Th>Assigned vehicle</Th>
                <Th>Last location</Th>
                <Th />
              </TableHeaderRow>
            </thead>
            <tbody>
              {starlinkKits.map((k) => {
                const vehicle = k.vehicleId ? vehicleById.get(k.vehicleId) : undefined;
                return (
                  <Tr key={k.id}>
                    <Td className="font-mono text-xs">{k.kitId}</Td>
                    <Td>
                      <Badge tone={STARLINK_STATUS_TONE[k.status]}>{k.status}</Badge>
                    </Td>
                    <Td>{vehicle ? `${vehicle.make} ${vehicle.model} (${vehicle.plateNumber})` : '—'}</Td>
                    <Td>
                      {k.lastLatitude != null && k.lastLongitude != null
                        ? `${k.lastLatitude.toFixed(4)}, ${k.lastLongitude.toFixed(4)}`
                        : 'Not set'}
                    </Td>
                    <Td>
                      <Link href={`/staff/fleet/starlink-kits/${k.id}`} className="text-forest hover:underline">
                        View
                      </Link>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  );
}

import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { authService, type PublicUser } from '@modules/auth';
import { fleetService, type DriverProfileView } from '@modules/fleet';
import { paginate } from '@lib/directory-filters';
import { DRIVER_STATUS_TONE, AVAILABILITY_STATUS_TONE } from '@lib/status-tones';
import { BackLink } from '@/components/ui/BackLink';
import { Badge } from '@/components/ui/Badge';
import { LinkButton } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { deleteDriverProfileAction } from './[driverProfileId]/actions';

const PER_PAGE = 10;

interface Props {
  searchParams: Promise<{ q?: string; status?: string; availability?: string; page?: string }>;
}

function matchesQuery(d: DriverProfileView, user: PublicUser | null, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    (user?.name?.toLowerCase().includes(q) ?? false) ||
    (user?.email.toLowerCase().includes(q) ?? false) ||
    d.licenseNumber.toLowerCase().includes(q)
  );
}

export default async function DriversListPage({ searchParams }: Props) {
  const ctx = await requireStaffContext('fleet.read');
  const params = await searchParams;
  const q = params.q ?? '';
  const status = params.status ?? '';
  const availability = params.availability ?? '';

  const allDrivers = await fleetService.listDriverProfiles(ctx);
  const allUsers = await Promise.all(allDrivers.map((d) => authService.getUser(d.userId)));
  const userByDriverId = new Map(allDrivers.map((d, i) => [d.id, allUsers[i]]));

  const filtered = allDrivers.filter((d) => {
    if (status && d.status !== status) return false;
    if (availability && d.availability !== availability) return false;
    if (!matchesQuery(d, userByDriverId.get(d.id) ?? null, q)) return false;
    return true;
  });
  const { items: drivers, page, totalPages, totalItems } = paginate(filtered, Number(params.page ?? '1'), PER_PAGE);

  const baseParams: Record<string, string> = {};
  if (q) baseParams.q = q;
  if (status) baseParams.status = status;
  if (availability) baseParams.availability = availability;

  function hrefWith(overrides: Record<string, string | undefined>): string {
    const merged = { ...baseParams, ...overrides };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v) qs.set(k, v);
    }
    const s = qs.toString();
    return s ? `/staff/fleet/drivers?${s}` : '/staff/fleet/drivers';
  }

  return (
    <div className="space-y-8">
      <BackLink href="/staff/fleet">back to fleet</BackLink>
      <div className="flex items-center justify-between">
        <PageHeader eyebrow="Fleet" title="Drivers" />
        <LinkButton href="/staff/fleet/drivers/new">Add driver</LinkButton>
      </div>

      <form method="get" action="/staff/fleet/drivers" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <FormField label="Search" htmlFor="q" optional>
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Name, email, or license #"
            className="w-full rounded-survey border border-rule px-3 py-2 text-sm"
          />
        </FormField>
        <FormField label="Status" htmlFor="status" optional>
          <Select name="status" defaultValue={status}>
            <option value="">All</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </Select>
        </FormField>
        <FormField label="Availability" htmlFor="availability" optional>
          <Select name="availability" defaultValue={availability}>
            <option value="">All</option>
            <option value="AVAILABLE">Available</option>
            <option value="BOOKED">Booked</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
        </FormField>
        <div className="col-span-2 flex items-end gap-3 sm:col-span-3">
          <SubmitButton size="compact">Filter</SubmitButton>
          {(q || status || availability) && (
            <Link href="/staff/fleet/drivers" className="text-sm text-mist hover:underline">
              Clear filters
            </Link>
          )}
        </div>
      </form>

      <p className="text-sm text-mist">
        {totalItems} driver{totalItems === 1 ? '' : 's'}
      </p>

      {drivers.length === 0 ? (
        <p className="text-mist">No driver profiles match these filters.</p>
      ) : (
        <Table>
          <thead>
            <TableHeaderRow>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>License #</Th>
              <Th>Status</Th>
              <Th>Availability</Th>
              <Th />
            </TableHeaderRow>
          </thead>
          <tbody>
            {drivers.map((d) => {
              const user = userByDriverId.get(d.id) ?? null;
              return (
                <Tr key={d.id}>
                  <Td>{user?.name ?? '—'}</Td>
                  <Td>{user?.email ?? '—'}</Td>
                  <Td>{d.licenseNumber}</Td>
                  <Td>
                    <Badge tone={DRIVER_STATUS_TONE[d.status]}>{d.status}</Badge>
                  </Td>
                  <Td>
                    <Badge tone={AVAILABILITY_STATUS_TONE[d.availability]}>{d.availability}</Badge>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Link href={`/staff/fleet/drivers/${d.id}`} className="text-forest hover:underline">
                        View
                      </Link>
                      {ctx.roles.includes('SUPERADMIN') && (
                        <form action={deleteDriverProfileAction.bind(null, d.id)}>
                          <SubmitButton
                            variant="secondary"
                            size="compact"
                            pendingLabel="Deleting…"
                            confirmMessage="Delete this driver profile? This cannot be undone."
                          >
                            Delete
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}

      <Pagination page={page} totalPages={totalPages} hrefFor={(p) => hrefWith({ page: p === 1 ? undefined : String(p) })} />
    </div>
  );
}

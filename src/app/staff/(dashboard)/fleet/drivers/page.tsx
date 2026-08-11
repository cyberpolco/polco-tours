import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
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
  const t = await getTranslations('StaffDrivers');
  const tDriverStatus = await getTranslations('DriverStatusLabel');
  const tAvailabilityStatus = await getTranslations('AvailabilityStatusLabel');
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
      <BackLink href="/staff/fleet">{t('backToFleet')}</BackLink>
      <div className="flex items-center justify-between">
        <PageHeader eyebrow={t('eyebrow')} title={t('title')} />
        <LinkButton href="/staff/fleet/drivers/new">{t('addDriver')}</LinkButton>
      </div>

      <form method="get" action="/staff/fleet/drivers" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <FormField label={t('search')} htmlFor="q" optional>
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder={t('searchPlaceholder')}
            className="w-full rounded-survey border border-rule px-3 py-2 text-sm"
          />
        </FormField>
        <FormField label={t('status')} htmlFor="status" optional>
          <Select name="status" defaultValue={status}>
            <option value="">{t('all')}</option>
            <option value="ACTIVE">{tDriverStatus('ACTIVE')}</option>
            <option value="SUSPENDED">{tDriverStatus('SUSPENDED')}</option>
          </Select>
        </FormField>
        <FormField label={t('availability')} htmlFor="availability" optional>
          <Select name="availability" defaultValue={availability}>
            <option value="">{t('all')}</option>
            <option value="AVAILABLE">{tAvailabilityStatus('AVAILABLE')}</option>
            <option value="BOOKED">{tAvailabilityStatus('BOOKED')}</option>
            <option value="INACTIVE">{tAvailabilityStatus('INACTIVE')}</option>
          </Select>
        </FormField>
        <div className="col-span-2 flex items-end gap-3 sm:col-span-3">
          <SubmitButton size="compact">{t('filter')}</SubmitButton>
          {(q || status || availability) && (
            <Link href="/staff/fleet/drivers" className="text-sm text-mist hover:underline">
              {t('clearFilters')}
            </Link>
          )}
        </div>
      </form>

      <p className="text-sm text-mist">{t('driverCount', { count: totalItems })}</p>

      {drivers.length === 0 ? (
        <p className="text-mist">{t('noMatches')}</p>
      ) : (
        <Table>
          <thead>
            <TableHeaderRow>
              <Th>{t('name')}</Th>
              <Th>{t('email')}</Th>
              <Th>{t('licenseNumber')}</Th>
              <Th>{t('status')}</Th>
              <Th>{t('availability')}</Th>
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
                    <Badge tone={DRIVER_STATUS_TONE[d.status]}>{tDriverStatus(d.status)}</Badge>
                  </Td>
                  <Td>
                    <Badge tone={AVAILABILITY_STATUS_TONE[d.availability]}>{tAvailabilityStatus(d.availability)}</Badge>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Link href={`/staff/fleet/drivers/${d.id}`} className="text-forest hover:underline">
                        {t('view')}
                      </Link>
                      {ctx.roles.includes('SUPERADMIN') && (
                        <form action={deleteDriverProfileAction.bind(null, d.id)}>
                          <SubmitButton
                            variant="secondary"
                            size="compact"
                            pendingLabel={t('deleting')}
                            confirmMessage={t('deleteConfirm')}
                          >
                            {t('delete')}
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

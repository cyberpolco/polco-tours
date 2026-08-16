import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { fleetService, type StarlinkKitView } from '@modules/fleet';
import { paginate } from '@lib/directory-filters';
import { STARLINK_STATUS_TONE } from '@lib/status-tones';
import { BackLink } from '@/components/ui/BackLink';
import { Badge } from '@/components/ui/Badge';
import { LinkButton } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { SearchField } from '@/components/ui/SearchField';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { deleteStarlinkKitAction } from './[kitId]/actions';

const PER_PAGE = 10;
type AssignedFilter = 'assigned' | 'unassigned';

interface Props {
  searchParams: Promise<{ q?: string; status?: string; assigned?: string; page?: string }>;
}

function matchesQuery(k: StarlinkKitView, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return k.kitId.toLowerCase().includes(q);
}

export default async function StarlinkKitsListPage({ searchParams }: Props) {
  const ctx = await requireStaffContext('fleet.read');
  const params = await searchParams;
  const t = await getTranslations('StaffStarlinkKits');
  const tStarlinkStatus = await getTranslations('StarlinkStatusLabel');
  const q = params.q ?? '';
  const status = params.status ?? '';
  const assigned: AssignedFilter | '' = params.assigned === 'assigned' || params.assigned === 'unassigned' ? params.assigned : '';

  const allKits = await fleetService.listStarlinkKits(ctx);
  const vehicleIds = [...new Set(allKits.map((k) => k.vehicleId).filter((id): id is string => id !== null))];
  const vehicles = await fleetService.listVehiclesByIds(ctx, vehicleIds);
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

  const filtered = allKits.filter((k) => {
    if (status && k.status !== status) return false;
    if (assigned === 'assigned' && !k.vehicleId) return false;
    if (assigned === 'unassigned' && k.vehicleId) return false;
    if (!matchesQuery(k, q)) return false;
    return true;
  });
  const { items: kits, page, totalPages, totalItems } = paginate(filtered, Number(params.page ?? '1'), PER_PAGE);

  const baseParams: Record<string, string> = {};
  if (q) baseParams.q = q;
  if (status) baseParams.status = status;
  if (assigned) baseParams.assigned = assigned;

  function hrefWith(overrides: Record<string, string | undefined>): string {
    const merged = { ...baseParams, ...overrides };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v) qs.set(k, v);
    }
    const s = qs.toString();
    return s ? `/staff/fleet/starlink-kits?${s}` : '/staff/fleet/starlink-kits';
  }

  return (
    <div className="space-y-8">
      <BackLink href="/staff/fleet">{t('backToFleet')}</BackLink>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader eyebrow={t('eyebrow')} title={t('title')} />
        <LinkButton href="/staff/fleet/starlink-kits/new">{t('addKit')}</LinkButton>
      </div>

      <form method="get" action="/staff/fleet/starlink-kits" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <FormField label={t('search')} htmlFor="q" optional>
          <SearchField name="q" defaultValue={q} placeholder={t('searchPlaceholder')} />
        </FormField>
        <FormField label={t('status')} htmlFor="status" optional>
          <Select name="status" defaultValue={status}>
            <option value="">{t('all')}</option>
            <option value="ACTIVE">{tStarlinkStatus('ACTIVE')}</option>
            <option value="INACTIVE">{tStarlinkStatus('INACTIVE')}</option>
            <option value="MAINTENANCE">{tStarlinkStatus('MAINTENANCE')}</option>
          </Select>
        </FormField>
        <FormField label={t('assignment')} htmlFor="assigned" optional>
          <Select name="assigned" defaultValue={assigned}>
            <option value="">{t('all')}</option>
            <option value="assigned">{t('assigned')}</option>
            <option value="unassigned">{t('unassigned')}</option>
          </Select>
        </FormField>
        <div className="col-span-2 flex items-end gap-3 sm:col-span-3">
          <SubmitButton size="compact">{t('filter')}</SubmitButton>
          {(q || status || assigned) && (
            <Link href="/staff/fleet/starlink-kits" className="text-sm text-mist hover:underline">
              {t('clearFilters')}
            </Link>
          )}
        </div>
      </form>

      <p className="text-sm text-mist">{t('kitCount', { count: totalItems })}</p>

      {kits.length === 0 ? (
        <p className="text-mist">{t('noMatches')}</p>
      ) : (
        <Table>
          <thead>
            <TableHeaderRow>
              <Th>{t('kitId')}</Th>
              <Th>{t('status')}</Th>
              <Th>{t('assignedVehicle')}</Th>
              <Th>{t('lastLocation')}</Th>
              <Th />
            </TableHeaderRow>
          </thead>
          <tbody>
            {kits.map((k) => {
              const vehicle = k.vehicleId ? vehicleById.get(k.vehicleId) : undefined;
              return (
                <Tr key={k.id}>
                  <Td className="font-mono text-xs">{k.kitId}</Td>
                  <Td>
                    <Badge tone={STARLINK_STATUS_TONE[k.status]}>{tStarlinkStatus(k.status)}</Badge>
                  </Td>
                  <Td>{vehicle ? `${vehicle.make} ${vehicle.model} (${vehicle.plateNumber})` : '—'}</Td>
                  <Td>
                    {k.lastLatitude != null && k.lastLongitude != null
                      ? `${k.lastLatitude.toFixed(4)}, ${k.lastLongitude.toFixed(4)}`
                      : t('notSet')}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Link href={`/staff/fleet/starlink-kits/${k.id}`} className="text-forest hover:underline">
                        {t('view')}
                      </Link>
                      {ctx.roles.includes('SUPERADMIN') && (
                        <form action={deleteStarlinkKitAction.bind(null, k.id)}>
                          <SubmitButton
                            variant="secondary"
                            size="compact"
                            pendingLabel={t('deleting')}
                            confirmMessage={t('deleteConfirm', { kitId: k.kitId })}
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

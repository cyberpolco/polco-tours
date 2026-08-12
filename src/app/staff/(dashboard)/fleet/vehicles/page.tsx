import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { fleetService, type VehicleView } from '@modules/fleet';
import { paginate } from '@lib/directory-filters';
import { VEHICLE_STATUS_TONE, AVAILABILITY_STATUS_TONE } from '@lib/status-tones';
import { BackLink } from '@/components/ui/BackLink';
import { Badge } from '@/components/ui/Badge';
import { LinkButton } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { deleteVehicleAction } from './[vehicleId]/actions';

const PER_PAGE = 10;

interface Props {
  searchParams: Promise<{ q?: string; status?: string; availability?: string; type?: string; page?: string }>;
}

function matchesQuery(v: VehicleView, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    v.plateNumber.toLowerCase().includes(q) ||
    v.make.toLowerCase().includes(q) ||
    v.model.toLowerCase().includes(q) ||
    (v.vin?.toLowerCase().includes(q) ?? false)
  );
}

// `vehicleType` is deliberately open-ended (see fleet/domain.ts's own
// comment -- varies too much across NA/DRC to enum), so its filter options
// are derived from whatever's actually in the data, same convention as
// directory-filters.ts's listEmailDomains.
function listVehicleTypes(vehicles: VehicleView[]): string[] {
  return [...new Set(vehicles.map((v) => v.vehicleType))].sort();
}

export default async function VehiclesListPage({ searchParams }: Props) {
  const ctx = await requireStaffContext('fleet.read');
  const params = await searchParams;
  const t = await getTranslations('StaffVehicles');
  const tVehicleStatus = await getTranslations('VehicleStatusLabel');
  const tAvailabilityStatus = await getTranslations('AvailabilityStatusLabel');
  const q = params.q ?? '';
  const status = params.status ?? '';
  const availability = params.availability ?? '';
  const type = params.type ?? '';

  const allVehicles = await fleetService.listVehicles(ctx);
  const typeOptions = listVehicleTypes(allVehicles);

  const filtered = allVehicles.filter((v) => {
    if (status && v.status !== status) return false;
    if (availability && v.availability !== availability) return false;
    if (type && v.vehicleType !== type) return false;
    if (!matchesQuery(v, q)) return false;
    return true;
  });
  const { items: vehicles, page, totalPages, totalItems } = paginate(filtered, Number(params.page ?? '1'), PER_PAGE);

  const baseParams: Record<string, string> = {};
  if (q) baseParams.q = q;
  if (status) baseParams.status = status;
  if (availability) baseParams.availability = availability;
  if (type) baseParams.type = type;

  function hrefWith(overrides: Record<string, string | undefined>): string {
    const merged = { ...baseParams, ...overrides };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v) qs.set(k, v);
    }
    const s = qs.toString();
    return s ? `/staff/fleet/vehicles?${s}` : '/staff/fleet/vehicles';
  }

  return (
    <div className="space-y-8">
      <BackLink href="/staff/fleet">{t('backToFleet')}</BackLink>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader eyebrow={t('eyebrow')} title={t('title')} />
        <LinkButton href="/staff/fleet/vehicles/new">{t('addVehicle')}</LinkButton>
      </div>

      <form method="get" action="/staff/fleet/vehicles" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
            <option value="ACTIVE">{tVehicleStatus('ACTIVE')}</option>
            <option value="MAINTENANCE">{tVehicleStatus('MAINTENANCE')}</option>
            <option value="RETIRED">{tVehicleStatus('RETIRED')}</option>
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
        <FormField label={t('type')} htmlFor="type" optional>
          <Select name="type" defaultValue={type}>
            <option value="">{t('all')}</option>
            {typeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="col-span-2 flex items-end gap-3 sm:col-span-4">
          <SubmitButton size="compact">{t('filter')}</SubmitButton>
          {(q || status || availability || type) && (
            <Link href="/staff/fleet/vehicles" className="text-sm text-mist hover:underline">
              {t('clearFilters')}
            </Link>
          )}
        </div>
      </form>

      <p className="text-sm text-mist">{t('vehicleCount', { count: totalItems })}</p>

      {vehicles.length === 0 ? (
        <p className="text-mist">{t('noMatches')}</p>
      ) : (
        <Table>
          <thead>
            <TableHeaderRow>
              <Th>{t('plate')}</Th>
              <Th>{t('makeModel')}</Th>
              <Th>{t('type')}</Th>
              <Th>{t('seats')}</Th>
              <Th>{t('status')}</Th>
              <Th>{t('availability')}</Th>
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
                  <Badge tone={VEHICLE_STATUS_TONE[v.status]}>{tVehicleStatus(v.status)}</Badge>
                </Td>
                <Td>
                  <Badge tone={AVAILABILITY_STATUS_TONE[v.availability]}>{tAvailabilityStatus(v.availability)}</Badge>
                </Td>
                <Td>
                  <div className="flex items-center gap-3">
                    <Link href={`/staff/fleet/vehicles/${v.id}`} className="text-forest hover:underline">
                      {t('view')}
                    </Link>
                    {/* DR-059: SUPERADMIN-only -- see the vehicle detail
                        page's own comment on why this role check (not just
                        the route's fleet.delete permission) is the real
                        gate for rendering the control at all. */}
                    {ctx.roles.includes('SUPERADMIN') && (
                      <form action={deleteVehicleAction.bind(null, v.id)}>
                        <SubmitButton
                          variant="secondary"
                          size="compact"
                          pendingLabel={t('deleting')}
                          confirmMessage={t('deleteConfirm', { plate: v.plateNumber })}
                        >
                          {t('delete')}
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

      <Pagination page={page} totalPages={totalPages} hrefFor={(p) => hrefWith({ page: p === 1 ? undefined : String(p) })} />
    </div>
  );
}

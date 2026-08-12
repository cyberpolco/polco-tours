import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { authService, type PublicUser } from '@modules/auth';
import { fleetService, type GuideProfileView } from '@modules/fleet';
import { paginate } from '@lib/directory-filters';
import { GUIDE_STATUS_TONE, AVAILABILITY_STATUS_TONE } from '@lib/status-tones';
import { BackLink } from '@/components/ui/BackLink';
import { Badge } from '@/components/ui/Badge';
import { LinkButton } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { deleteGuideProfileAction } from './[guideProfileId]/actions';

const PER_PAGE = 10;

interface Props {
  searchParams: Promise<{ q?: string; status?: string; availability?: string; specialty?: string; page?: string }>;
}

function matchesQuery(g: GuideProfileView, user: PublicUser | null, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    (user?.name?.toLowerCase().includes(q) ?? false) ||
    (user?.email.toLowerCase().includes(q) ?? false) ||
    g.languages.some((l) => l.toLowerCase().includes(q)) ||
    g.specialties.some((s) => s.toLowerCase().includes(q))
  );
}

// specialties are freeform tags (see fleet/domain.ts's own comment), so this
// filter's options are derived from whatever's actually in the data, same
// convention as the vehicles list page's "type" filter.
function listSpecialties(guides: GuideProfileView[]): string[] {
  const specialties = new Set<string>();
  for (const g of guides) {
    for (const s of g.specialties) specialties.add(s);
  }
  return [...specialties].sort();
}

export default async function GuidesListPage({ searchParams }: Props) {
  const ctx = await requireStaffContext('fleet.read');
  const params = await searchParams;
  const t = await getTranslations('StaffGuides');
  const tGuideStatus = await getTranslations('GuideStatusLabel');
  const tAvailabilityStatus = await getTranslations('AvailabilityStatusLabel');
  const q = params.q ?? '';
  const status = params.status ?? '';
  const availability = params.availability ?? '';
  const specialty = params.specialty ?? '';

  const allGuides = await fleetService.listGuideProfiles(ctx);
  const specialtyOptions = listSpecialties(allGuides);
  const allUsers = await Promise.all(allGuides.map((g) => authService.getUser(g.userId)));
  const userByGuideId = new Map(allGuides.map((g, i) => [g.id, allUsers[i]]));

  const filtered = allGuides.filter((g) => {
    if (status && g.status !== status) return false;
    if (availability && g.availability !== availability) return false;
    if (specialty && !g.specialties.includes(specialty)) return false;
    if (!matchesQuery(g, userByGuideId.get(g.id) ?? null, q)) return false;
    return true;
  });
  const { items: guides, page, totalPages, totalItems } = paginate(filtered, Number(params.page ?? '1'), PER_PAGE);

  const baseParams: Record<string, string> = {};
  if (q) baseParams.q = q;
  if (status) baseParams.status = status;
  if (availability) baseParams.availability = availability;
  if (specialty) baseParams.specialty = specialty;

  function hrefWith(overrides: Record<string, string | undefined>): string {
    const merged = { ...baseParams, ...overrides };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v) qs.set(k, v);
    }
    const s = qs.toString();
    return s ? `/staff/fleet/guides?${s}` : '/staff/fleet/guides';
  }

  return (
    <div className="space-y-8">
      <BackLink href="/staff/fleet">{t('backToFleet')}</BackLink>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader eyebrow={t('eyebrow')} title={t('title')} />
        <LinkButton href="/staff/fleet/guides/new">{t('addGuide')}</LinkButton>
      </div>

      <form method="get" action="/staff/fleet/guides" className="grid grid-cols-2 gap-4 sm:grid-cols-5">
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
            <option value="ACTIVE">{tGuideStatus('ACTIVE')}</option>
            <option value="SUSPENDED">{tGuideStatus('SUSPENDED')}</option>
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
        <FormField label={t('specialty')} htmlFor="specialty" optional>
          <Select name="specialty" defaultValue={specialty}>
            <option value="">{t('all')}</option>
            {specialtyOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="col-span-2 flex items-end gap-3 sm:col-span-4">
          <SubmitButton size="compact">{t('filter')}</SubmitButton>
          {(q || status || availability || specialty) && (
            <Link href="/staff/fleet/guides" className="text-sm text-mist hover:underline">
              {t('clearFilters')}
            </Link>
          )}
        </div>
      </form>

      <p className="text-sm text-mist">{t('guideCount', { count: totalItems })}</p>

      {guides.length === 0 ? (
        <p className="text-mist">{t('noMatches')}</p>
      ) : (
        <Table>
          <thead>
            <TableHeaderRow>
              <Th>{t('name')}</Th>
              <Th>{t('email')}</Th>
              <Th>{t('languages')}</Th>
              <Th>{t('specialties')}</Th>
              <Th>{t('status')}</Th>
              <Th>{t('availability')}</Th>
              <Th />
            </TableHeaderRow>
          </thead>
          <tbody>
            {guides.map((g) => {
              const user = userByGuideId.get(g.id) ?? null;
              return (
                <Tr key={g.id}>
                  <Td>{user?.name ?? '—'}</Td>
                  <Td>{user?.email ?? '—'}</Td>
                  <Td>{g.languages.join(', ') || '—'}</Td>
                  <Td>{g.specialties.join(', ') || '—'}</Td>
                  <Td>
                    <Badge tone={GUIDE_STATUS_TONE[g.status]}>{tGuideStatus(g.status)}</Badge>
                  </Td>
                  <Td>
                    <Badge tone={AVAILABILITY_STATUS_TONE[g.availability]}>{tAvailabilityStatus(g.availability)}</Badge>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Link href={`/staff/fleet/guides/${g.id}`} className="text-forest hover:underline">
                        {t('view')}
                      </Link>
                      {ctx.roles.includes('SUPERADMIN') && (
                        <form action={deleteGuideProfileAction.bind(null, g.id)}>
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

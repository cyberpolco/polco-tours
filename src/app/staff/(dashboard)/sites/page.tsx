import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { itineraryService, type ActivityView, type SiteView } from '@modules/itinerary';
import { paginate } from '@lib/directory-filters';
import { FormField } from '@/components/ui/FormField';
import { LinkButton } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { SearchField } from '@/components/ui/SearchField';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { SETTINGS_ITEMS } from '../settings-items';
import { SidebarShell } from '../sidebar-shell';

const PER_PAGE = 10;

interface Props {
  searchParams: Promise<{ q?: string; country?: string; page?: string }>;
}

function matchesQuery(s: SiteView, activityNames: string[], query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    s.name.toLowerCase().includes(q) ||
    s.province.toLowerCase().includes(q) ||
    (s.city?.toLowerCase().includes(q) ?? false) ||
    activityNames.some((a) => a.toLowerCase().includes(q))
  );
}

function listCountries(sites: SiteView[]): string[] {
  return [...new Set(sites.map((s) => s.country))].sort();
}

function groupActivitiesBySite(activities: ActivityView[]): Map<string, ActivityView[]> {
  const bySite = new Map<string, ActivityView[]>();
  for (const a of activities) {
    const list = bySite.get(a.siteId) ?? [];
    list.push(a);
    bySite.set(a.siteId, list);
  }
  return bySite;
}

// DR-083: staff-managed reference list of named sites/attractions per
// country -- populates the itinerary daily-schedule's "planned sites"
// picker. Same "lightweight reusable reference entity" precedent as
// hotels/page.tsx, manager-only (no rating concept here). Lives under
// Settings (explicit user direction), unlike Hotels/Restaurants which
// stay top-level.
// Activities column + search/filter/pagination added on top of that list,
// same DR-091/095/097/098/099 convention -- activities are DR-116's own
// per-site reference entities (itineraryService.listActivities), grouped
// here by siteId rather than added as a new SiteView field.
export default async function SitesPage({ searchParams }: Props) {
  const ctx = await requireStaffContext('itinerary.write');
  const params = await searchParams;
  const t = await getTranslations('StaffSites');
  const tFields = await getTranslations('PlaceFields');
  const tSidebar = await getTranslations('StaffSettingsSidebar');
  const tCountries = await getTranslations('Countries');
  const q = params.q ?? '';
  const country = params.country ?? '';

  const [allSites, allActivities] = await Promise.all([itineraryService.listSites(ctx), itineraryService.listActivities(ctx)]);
  const activitiesBySite = groupActivitiesBySite(allActivities);
  const countryOptions = listCountries(allSites);

  const filtered = allSites.filter((s) => {
    if (country && s.country !== country) return false;
    const activityNames = (activitiesBySite.get(s.id) ?? []).map((a) => a.name);
    if (!matchesQuery(s, activityNames, q)) return false;
    return true;
  });
  const { items: sites, page, totalPages, totalItems } = paginate(filtered, Number(params.page ?? '1'), PER_PAGE);

  const baseParams: Record<string, string> = {};
  if (q) baseParams.q = q;
  if (country) baseParams.country = country;

  function hrefWith(overrides: Record<string, string | undefined>): string {
    const merged = { ...baseParams, ...overrides };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v) qs.set(k, v);
    }
    const s = qs.toString();
    return s ? `/staff/sites?${s}` : '/staff/sites';
  }

  return (
    <SidebarShell items={SETTINGS_ITEMS} sectionTitle={tSidebar('sectionTitle')} roles={ctx.roles} permissions={[...ctx.permissions]}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PageHeader eyebrow={t('eyebrow')} title={t('title')} />
          <LinkButton href="/staff/sites/new">{t('addSite')}</LinkButton>
        </div>

        <form method="get" action="/staff/sites" className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <FormField label={tFields('search')} htmlFor="q" optional>
            <SearchField name="q" defaultValue={q} placeholder={t('searchPlaceholder')} />
          </FormField>
          <FormField label={tFields('country')} htmlFor="country" optional>
            <Select name="country" defaultValue={country}>
              <option value="">{tFields('all')}</option>
              {countryOptions.map((c) => (
                <option key={c} value={c}>
                  {tCountries(c)}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="col-span-2 flex items-end gap-3 sm:col-span-1">
            <SubmitButton size="compact">{tFields('filter')}</SubmitButton>
            {(q || country) && (
              <Link href="/staff/sites" className="text-sm text-mist hover:underline">
                {tFields('clearFilters')}
              </Link>
            )}
          </div>
        </form>

        <p className="text-sm text-mist">{t('siteCount', { count: totalItems })}</p>

        {sites.length === 0 ? (
          <p className="text-mist">{totalItems === 0 && !q && !country ? t('noneRegistered') : t('noMatches')}</p>
        ) : (
          <Table>
            <thead>
              <TableHeaderRow>
                <Th>{t('name')}</Th>
                <Th>{t('country')}</Th>
                <Th>{t('province')}</Th>
                <Th>{t('cityTown')}</Th>
                <Th>{t('activities')}</Th>
                <Th />
              </TableHeaderRow>
            </thead>
            <tbody>
              {sites.map((s) => {
                const activityNames = (activitiesBySite.get(s.id) ?? []).map((a) => a.name);
                return (
                  <Tr key={s.id}>
                    <Td>{s.name}</Td>
                    <Td>{tCountries(s.country)}</Td>
                    <Td>{s.province}</Td>
                    <Td>{s.city ?? '—'}</Td>
                    <Td>{activityNames.length > 0 ? activityNames.join(', ') : '—'}</Td>
                    <Td>
                      <Link href={`/staff/sites/${s.id}`} className="text-forest hover:underline">
                        {t('edit')}
                      </Link>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}

        <Pagination page={page} totalPages={totalPages} hrefFor={(p) => hrefWith({ page: p === 1 ? undefined : String(p) })} />
      </div>
    </SidebarShell>
  );
}

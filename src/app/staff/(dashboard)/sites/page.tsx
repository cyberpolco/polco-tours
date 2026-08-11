import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { itineraryService } from '@modules/itinerary';
import { LinkButton } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { SETTINGS_ITEMS } from '../settings-items';
import { SidebarShell } from '../sidebar-shell';

// DR-083: staff-managed reference list of named sites/attractions per
// country -- populates the itinerary daily-schedule's "planned sites"
// picker. Same "lightweight reusable reference entity" precedent as
// hotels/page.tsx, manager-only (no rating concept here). Lives under
// Settings (explicit user direction), unlike Hotels/Restaurants which
// stay top-level.
export default async function SitesPage() {
  const ctx = await requireStaffContext('itinerary.write');
  const sites = await itineraryService.listSites(ctx);
  const t = await getTranslations('StaffSites');
  const tSidebar = await getTranslations('StaffSettingsSidebar');
  const tCountries = await getTranslations('Countries');

  return (
    <SidebarShell items={SETTINGS_ITEMS} sectionTitle={tSidebar('sectionTitle')} roles={ctx.roles} permissions={[...ctx.permissions]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <PageHeader eyebrow={t('eyebrow')} title={t('title')} />
          <LinkButton href="/staff/sites/new">{t('addSite')}</LinkButton>
        </div>
        {sites.length === 0 ? (
          <p className="text-mist">{t('noneRegistered')}</p>
        ) : (
          <Table>
            <thead>
              <TableHeaderRow>
                <Th>{t('name')}</Th>
                <Th>{t('country')}</Th>
                <Th>{t('province')}</Th>
                <Th>{t('cityTown')}</Th>
                <Th />
              </TableHeaderRow>
            </thead>
            <tbody>
              {sites.map((s) => (
                <Tr key={s.id}>
                  <Td>{s.name}</Td>
                  <Td>{tCountries(s.country)}</Td>
                  <Td>{s.province}</Td>
                  <Td>{s.city ?? '—'}</Td>
                  <Td>
                    <Link href={`/staff/sites/${s.id}`} className="text-forest hover:underline">
                      {t('edit')}
                    </Link>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </SidebarShell>
  );
}

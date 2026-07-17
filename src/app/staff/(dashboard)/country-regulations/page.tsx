import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { immigrationService } from '@modules/immigration';
import { LinkButton } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { SETTINGS_ITEMS } from '../settings-items';
import { SidebarShell } from '../sidebar-shell';

// Immigration Module (DR-034). Read is available to whoever processes
// visas (TOUR_OPERATOR/VISA_FACILITATOR/SUPERADMIN/PLATFORM_ADMIN); the "Add
// country" control and the write routes it links to are SUPERADMIN-only --
// PLATFORM_ADMIN passes the route-level permission gate but is rejected by
// immigrationService's explicit isCountryRegulationWriter check, so the
// button is hidden here too rather than dangling a control that would 403.
export default async function CountryRegulationsPage() {
  const ctx = await requireStaffContext('country_regulation.read');
  const regulations = await immigrationService.listRegulations(ctx);
  const canWrite = ctx.roles.includes('SUPERADMIN');

  return (
    <SidebarShell items={SETTINGS_ITEMS} sectionTitle="Settings" roles={ctx.roles} permissions={[...ctx.permissions]}>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader eyebrow="Immigration" title="Country regulations" />
        {canWrite && <LinkButton href="/staff/country-regulations/new">Add country</LinkButton>}
      </div>
      {regulations.length === 0 ? (
        <p className="text-mist">No country regulations on file yet.</p>
      ) : (
        <Table>
          <thead>
            <TableHeaderRow>
              <Th>Country</Th>
              <Th>Processing time</Th>
              <Th>Embassy</Th>
              <Th />
            </TableHeaderRow>
          </thead>
          <tbody>
            {regulations.map((r) => (
              <Tr key={r.id}>
                <Td>{r.country}</Td>
                <Td>{r.processingTimeDays != null ? `${r.processingTimeDays} days` : '—'}</Td>
                <Td>{r.embassyName ?? '—'}</Td>
                <Td>
                  <Link href={`/staff/country-regulations/${r.country}`} className="text-forest hover:underline">
                    {canWrite ? 'Edit' : 'View'}
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

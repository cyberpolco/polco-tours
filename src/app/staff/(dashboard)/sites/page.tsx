import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { itineraryService } from '@modules/itinerary';
import { LinkButton } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';

// DR-083: staff-managed reference list of named sites/attractions per
// country -- populates the itinerary daily-schedule's "planned sites"
// picker. Same "lightweight reusable reference entity" precedent as
// hotels/page.tsx, manager-only (no rating concept here).
export default async function SitesPage() {
  const ctx = await requireStaffContext('itinerary.write');
  const sites = await itineraryService.listSites(ctx);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader eyebrow="Itinerary Management" title="Sites" />
        <LinkButton href="/staff/sites/new">Add site</LinkButton>
      </div>
      {sites.length === 0 ? (
        <p className="text-mist">No sites registered yet.</p>
      ) : (
        <Table>
          <thead>
            <TableHeaderRow>
              <Th>Name</Th>
              <Th>Country</Th>
              <Th />
            </TableHeaderRow>
          </thead>
          <tbody>
            {sites.map((s) => (
              <Tr key={s.id}>
                <Td>{s.name}</Td>
                <Td>{s.country}</Td>
                <Td>
                  <Link href={`/staff/sites/${s.id}`} className="text-forest hover:underline">
                    Edit
                  </Link>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

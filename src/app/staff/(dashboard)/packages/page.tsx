import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { catalogService } from '@modules/catalog';
import { Badge } from '@/components/ui/Badge';
import { LinkButton } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { format, money } from '@lib/money';
import { PACKAGE_STATUS_TONE } from '@lib/status-tones';

// First-ever staff package-management UI (DR-028) -- creation/editing was
// only ever reachable via the raw /api/v1/catalog/packages routes before.
export default async function PackagesPage() {
  const ctx = await requireStaffContext('catalog.read');
  const packages = await catalogService.listPackages(ctx);

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader eyebrow="Dashboard" title="Packages" />
        <LinkButton href="/staff/packages/new">New package</LinkButton>
      </div>
      {packages.length === 0 ? (
        <p className="mt-6 text-mist">No packages yet.</p>
      ) : (
        <Table className="mt-6">
          <thead>
            <TableHeaderRow>
              <Th>Reference</Th>
              <Th>Title</Th>
              <Th>Country</Th>
              <Th>Price</Th>
              <Th>Status</Th>
              <Th />
            </TableHeaderRow>
          </thead>
          <tbody>
            {packages.map((p) => (
              <Tr key={p.id}>
                <Td className="font-mono text-xs">{p.packageReference}</Td>
                <Td>{p.title}</Td>
                <Td>{p.country}</Td>
                <Td>{format(money(p.priceMinor, p.currency))}</Td>
                <Td>
                  <Badge tone={PACKAGE_STATUS_TONE[p.status]}>{p.status}</Badge>
                </Td>
                <Td>
                  <Link href={`/staff/packages/${p.id}`} className="text-forest hover:underline">
                    View
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

import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { itineraryService } from '@modules/itinerary';
import { LinkButton } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';

// Lightweight reusable reference entities (Itinerary Management, DR-033) --
// name + contact info only, no compliance tracking like the fleet module.
export default async function HotelsPage() {
  const ctx = await requireStaffContext('itinerary.write');
  const hotels = await itineraryService.listHotels(ctx);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader eyebrow="Itinerary Management" title="Hotels" />
        <LinkButton href="/staff/hotels/new">Add hotel</LinkButton>
      </div>
      {hotels.length === 0 ? (
        <p className="text-mist">No hotels registered yet.</p>
      ) : (
        <Table>
          <thead>
            <TableHeaderRow>
              <Th>Name</Th>
              <Th>Country</Th>
              <Th>Address</Th>
              <Th>Contact</Th>
              <Th />
            </TableHeaderRow>
          </thead>
          <tbody>
            {hotels.map((h) => (
              <Tr key={h.id}>
                <Td>{h.name}</Td>
                <Td>{h.country}</Td>
                <Td>{h.address ?? '—'}</Td>
                <Td>{h.contactPhone ?? h.contactEmail ?? '—'}</Td>
                <Td>
                  <Link href={`/staff/hotels/${h.id}`} className="text-forest hover:underline">
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

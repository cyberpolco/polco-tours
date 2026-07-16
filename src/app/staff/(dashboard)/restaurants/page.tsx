import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { itineraryService } from '@modules/itinerary';
import { LinkButton } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';

// Lightweight reusable reference entities (Itinerary Management, DR-033) --
// name + contact info only, no compliance tracking like the fleet module.
export default async function RestaurantsPage() {
  const ctx = await requireStaffContext('itinerary.write');
  const restaurants = await itineraryService.listRestaurants(ctx);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader eyebrow="Itinerary Management" title="Restaurants" />
        <LinkButton href="/staff/restaurants/new">Add restaurant</LinkButton>
      </div>
      {restaurants.length === 0 ? (
        <p className="text-mist">No restaurants registered yet.</p>
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
            {restaurants.map((r) => (
              <Tr key={r.id}>
                <Td>{r.name}</Td>
                <Td>{r.country}</Td>
                <Td>{r.address ?? '—'}</Td>
                <Td>{r.contactPhone ?? r.contactEmail ?? '—'}</Td>
                <Td>
                  <Link href={`/staff/restaurants/${r.id}`} className="text-forest hover:underline">
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

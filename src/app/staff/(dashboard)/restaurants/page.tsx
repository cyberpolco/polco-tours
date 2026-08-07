import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { can } from '@lib/rbac';
import { itineraryService } from '@modules/itinerary';
import { LinkButton } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';

// Lightweight reusable reference entities (Itinerary Management, DR-033) --
// name + contact info only, no compliance tracking like the fleet module.
// DR-083: restaurant counterpart to hotels/page.tsx -- identical shape/rules.
export default async function RestaurantsPage() {
  const ctx = await requireStaffContext('itinerary.read');
  const canWrite = can(ctx, 'itinerary.write');
  const canRate = can(ctx, 'hotel_restaurant_rating.write');

  let restaurants = await itineraryService.listRestaurants(ctx);
  if (!canWrite) {
    const rateableIds = new Set(await itineraryService.listMyRateableRestaurantIds(ctx));
    restaurants = restaurants.filter((r) => rateableIds.has(r.id));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader eyebrow="Itinerary Management" title="Restaurants" />
        {canWrite && <LinkButton href="/staff/restaurants/new">Add restaurant</LinkButton>}
      </div>
      {restaurants.length === 0 ? (
        <p className="text-mist">{canWrite ? 'No restaurants registered yet.' : 'No restaurants to rate yet.'}</p>
      ) : (
        <Table>
          <thead>
            <TableHeaderRow>
              <Th>Name</Th>
              <Th>Country</Th>
              <Th>Address</Th>
              <Th>Contact</Th>
              <Th>Rating</Th>
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
                <Td>{r.averageRating != null ? `${r.averageRating.toFixed(1)} ★ (${r.ratingCount})` : '—'}</Td>
                <Td>
                  <Link href={`/staff/restaurants/${r.id}`} className="text-forest hover:underline">
                    {canWrite ? 'Edit' : canRate ? 'Rate' : 'View'}
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

import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { can } from '@lib/rbac';
import { itineraryService } from '@modules/itinerary';
import { LinkButton } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';

// Lightweight reusable reference entities (Itinerary Management, DR-033) --
// name + contact info only, no compliance tracking like the fleet module.
// DR-083: broadened from itinerary.write-only so TOUR_GUIDE/DRIVER
// (itinerary.read + hotel_restaurant_rating.write, no itinerary.write) can
// reach here to rate a hotel -- rating moved off the itinerary page onto
// this one. Non-managers see only hotels they've actually toured
// (anti-BOLA, same scope rateHotel itself enforces), not the whole org list.
export default async function HotelsPage() {
  const ctx = await requireStaffContext('itinerary.read');
  const canWrite = can(ctx, 'itinerary.write');
  const canRate = can(ctx, 'hotel_restaurant_rating.write');

  let hotels = await itineraryService.listHotels(ctx);
  if (!canWrite) {
    const rateableIds = new Set(await itineraryService.listMyRateableHotelIds(ctx));
    hotels = hotels.filter((h) => rateableIds.has(h.id));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader eyebrow="Itinerary Management" title="Hotels" />
        {canWrite && <LinkButton href="/staff/hotels/new">Add hotel</LinkButton>}
      </div>
      {hotels.length === 0 ? (
        <p className="text-mist">{canWrite ? 'No hotels registered yet.' : 'No hotels to rate yet.'}</p>
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
            {hotels.map((h) => (
              <Tr key={h.id}>
                <Td>{h.name}</Td>
                <Td>{h.country}</Td>
                <Td>{h.address ?? '—'}</Td>
                <Td>{h.contactPhone ?? h.contactEmail ?? '—'}</Td>
                <Td>{h.averageRating != null ? `${h.averageRating.toFixed(1)} ★ (${h.ratingCount})` : '—'}</Td>
                <Td>
                  <Link href={`/staff/hotels/${h.id}`} className="text-forest hover:underline">
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

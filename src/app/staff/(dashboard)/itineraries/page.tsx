import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { bookingService } from '@modules/booking';
import { itineraryService } from '@modules/itinerary';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { BOOKING_STATUS_TONE, ITINERARY_STATUS_TONE } from '@lib/status-tones';

// Manager-only (itinerary.write) -- the entry point for reaching a specific
// itinerary is normally a booking's detail page ("Create itinerary"); this
// list is for browsing everything already created, mirroring the DR-028
// staff/packages list convention.
export default async function ItinerariesPage() {
  const ctx = await requireStaffContext('itinerary.write');
  const allItineraries = await itineraryService.listAll(ctx);
  const allBookings = await Promise.all(allItineraries.map((i) => bookingService.getById(ctx, i.bookingId)));

  // DR-049: no longer hidden -- convertToItinerary only requires a sent
  // quotation (priced), not an accepted one, so an Itinerary can exist for a
  // booking still awaiting the guest's acceptance; the booking's own status
  // badge makes that visible instead of hiding the row.
  const rows = allItineraries.map((itinerary, i) => ({ itinerary, booking: allBookings[i] }));

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Itineraries" title="Operational plans" />
      {rows.length === 0 ? (
        <p className="text-mist">No itineraries created yet -- create one from a booking&apos;s detail page.</p>
      ) : (
        <Table>
          <thead>
            <TableHeaderRow>
              <Th>Booking</Th>
              <Th>Booking status</Th>
              <Th>Itinerary status</Th>
              <Th />
            </TableHeaderRow>
          </thead>
          <tbody>
            {rows.map(({ itinerary, booking }) => (
              <Tr key={itinerary.id}>
                <Td>{booking?.bookingReference ?? itinerary.bookingId}</Td>
                <Td>
                  {booking ? <Badge tone={BOOKING_STATUS_TONE[booking.status]}>{booking.status}</Badge> : '—'}
                </Td>
                <Td>
                  <Badge tone={ITINERARY_STATUS_TONE[itinerary.status]}>{itinerary.status}</Badge>
                </Td>
                <Td>
                  <Link href={`/staff/itineraries/${itinerary.id}`} className="text-forest hover:underline">
                    Open
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

import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { bookingService } from '@modules/booking';
import { itineraryService } from '@modules/itinerary';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { ITINERARY_STATUS_TONE } from '@lib/status-tones';

// Manager-only (itinerary.write) -- the entry point for reaching a specific
// itinerary is normally a booking's detail page ("Create itinerary"); this
// list is for browsing everything already created, mirroring the DR-028
// staff/packages list convention.
export default async function ItinerariesPage() {
  const ctx = await requireStaffContext('itinerary.write');
  const itineraries = await itineraryService.listAll(ctx);
  const bookings = await Promise.all(itineraries.map((i) => bookingService.getById(ctx, i.bookingId)));

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Itineraries" title="Operational plans" />
      {itineraries.length === 0 ? (
        <p className="text-mist">No itineraries created yet -- create one from a booking&apos;s detail page.</p>
      ) : (
        <Table>
          <thead>
            <TableHeaderRow>
              <Th>Booking</Th>
              <Th>Status</Th>
              <Th />
            </TableHeaderRow>
          </thead>
          <tbody>
            {itineraries.map((itinerary, i) => (
              <Tr key={itinerary.id}>
                <Td>{bookings[i]?.bookingReference ?? itinerary.bookingId}</Td>
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

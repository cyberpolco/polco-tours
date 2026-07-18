import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { bookingService, isPendingInquiry } from '@modules/booking';
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
  const allItineraries = await itineraryService.listAll(ctx);
  const allBookings = await Promise.all(allItineraries.map((i) => bookingService.getById(ctx, i.bookingId)));

  // convertToItinerary only requires a sent quotation (priced), not an
  // accepted one -- an Itinerary can technically exist for a booking still
  // awaiting the guest's acceptance. Same DR-048 rule as /staff/bookings:
  // stays hidden here too until the quotation is accepted, reachable via
  // /staff/quote-requests in the meantime.
  const rows = allItineraries
    .map((itinerary, i) => ({ itinerary, booking: allBookings[i] }))
    .filter(({ booking }) => !booking || !isPendingInquiry(booking));

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
              <Th>Status</Th>
              <Th />
            </TableHeaderRow>
          </thead>
          <tbody>
            {rows.map(({ itinerary, booking }) => (
              <Tr key={itinerary.id}>
                <Td>{booking?.bookingReference ?? itinerary.bookingId}</Td>
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

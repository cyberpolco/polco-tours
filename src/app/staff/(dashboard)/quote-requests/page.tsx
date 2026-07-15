import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { bookingService } from '@modules/booking';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { formatOrPending } from '@lib/money';
import { BOOKING_STATUS_TONE } from '@lib/status-tones';

// Follow-up queue for guests who picked "request a quotation" instead of
// paying, or a tailor-made request awaiting a price (DR-024, extended for
// tailor-made bookings) -- these don't expire and (for AWAITING_QUOTATION)
// hold no seat, so unlike the regular bookings list they need active staff
// attention, not just a record. Same Table/Badge pattern as the bookings
// list; reuses bookingService.list (org-wide manifest for staff) rather than
// a new service method, filtered here since the org's booking volume is
// small (DR-005 single-tenant launch).
const QUOTE_PIPELINE_STATUSES = ['AWAITING_QUOTATION', 'QUOTATION_SENT'];

export default async function QuoteRequestsPage() {
  const ctx = await requireStaffContext('booking.read');
  const quotes = (await bookingService.list(ctx)).filter((b) => QUOTE_PIPELINE_STATUSES.includes(b.status));

  return (
    <div>
      <PageHeader eyebrow="Dashboard" title="Quote requests" />
      {quotes.length === 0 ? (
        <p className="mt-6 text-mist">No quote requests right now.</p>
      ) : (
        <Table className="mt-6">
          <thead>
            <TableHeaderRow>
              <Th>Status</Th>
              <Th>Seats</Th>
              <Th>Price</Th>
              <Th>Requested</Th>
              <Th />
            </TableHeaderRow>
          </thead>
          <tbody>
            {quotes.map((b) => (
              <Tr key={b.id}>
                <Td>
                  <Badge tone={BOOKING_STATUS_TONE[b.status]}>{b.status}</Badge>
                </Td>
                <Td>{b.seats}</Td>
                <Td>{formatOrPending(b.priceMinor, b.currency)}</Td>
                <Td>{b.updatedAt.toLocaleDateString()}</Td>
                <Td>
                  <Link href={`/staff/bookings/${b.id}`} className="text-forest hover:underline">
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

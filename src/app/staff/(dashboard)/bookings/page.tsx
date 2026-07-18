import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { bookingService, isPendingInquiry } from '@modules/booking';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { formatOrPending } from '@lib/money';
import { BOOKING_STATUS_TONE } from '@lib/status-tones';

export default async function BookingsPage() {
  const ctx = await requireStaffContext('booking.read');
  // A fresh TAILOR_MADE request is still just an inquiry until its
  // quotation is accepted (DR-048) -- it stays visible via
  // /staff/quote-requests instead, same convention as that page's own
  // status filter.
  const bookings = (await bookingService.list(ctx)).filter((b) => !isPendingInquiry(b)); // staff -> full org manifest

  return (
    <div>
      <PageHeader eyebrow="Dashboard" title="Bookings" />
      {bookings.length === 0 ? (
        <p className="mt-6 text-mist">No bookings yet.</p>
      ) : (
        <Table className="mt-6">
          <thead>
            <TableHeaderRow>
              <Th>Reference</Th>
              <Th>Status</Th>
              <Th>Seats</Th>
              <Th>Price</Th>
              <Th>Created</Th>
              <Th />
            </TableHeaderRow>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <Tr key={b.id}>
                <Td className="font-mono text-xs">{b.bookingReference}</Td>
                <Td>
                  <Badge tone={BOOKING_STATUS_TONE[b.status]}>{b.status}</Badge>
                </Td>
                <Td>{b.seats}</Td>
                <Td>{formatOrPending(b.priceMinor, b.currency)}</Td>
                <Td>{b.createdAt.toLocaleDateString()}</Td>
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

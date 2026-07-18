import Link from 'next/link';
import type { BookingStatus } from '@prisma/client';
import { requireStaffContext } from '@lib/staff-guard';
import { bookingService } from '@modules/booking';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { formatOrPending } from '@lib/money';
import { BOOKING_STATUS_TONE } from '@lib/status-tones';

interface Props {
  searchParams: Promise<{ status?: string }>;
}

// Every booking, regardless of which of the 3 entry points created it
// (guest browsing packages, guest /plan-my-trip, or staff's own "New
// booking" form -- the latter can produce either origin below too), lands
// here. Status is the single differentiator; DRAFT is a schema default no
// creation path ever actually sets (see domain.ts's TRANSITIONS comment),
// omitted from the filter so it never offers an option that can't match
// anything.
const FILTERABLE_STATUSES: BookingStatus[] = [
  'AWAITING_QUOTATION',
  'QUOTATION_SENT',
  'AWAITING_DEPOSIT',
  'DEPOSIT_PAID',
  'FULLY_PAID',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
];

const ORIGIN_LABEL: Record<string, string> = {
  PREDEFINED_PACKAGE: 'Package',
  TAILOR_MADE: 'Plan my trip',
};

export default async function BookingsPage({ searchParams }: Props) {
  const ctx = await requireStaffContext('booking.read');
  const { status } = await searchParams;
  const allBookings = await bookingService.list(ctx); // staff -> full org manifest, every source
  const bookings = status ? allBookings.filter((b) => b.status === status) : allBookings;

  function pillHref(nextStatus?: string): string {
    return nextStatus ? `/staff/bookings?status=${nextStatus}` : '/staff/bookings';
  }

  return (
    <div>
      <PageHeader eyebrow="Dashboard" title="Bookings" />
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link
          href={pillHref(undefined)}
          className={`rounded-survey border border-rule px-3 py-1 ${!status ? 'bg-navy text-bone' : 'text-ink'}`}
        >
          All ({allBookings.length})
        </Link>
        {FILTERABLE_STATUSES.map((s) => {
          const count = allBookings.filter((b) => b.status === s).length;
          if (count === 0) return null;
          return (
            <Link
              key={s}
              href={pillHref(s)}
              className={`rounded-survey border border-rule px-3 py-1 ${status === s ? 'bg-navy text-bone' : 'text-ink'}`}
            >
              {s} ({count})
            </Link>
          );
        })}
      </div>
      {bookings.length === 0 ? (
        <p className="mt-6 text-mist">No bookings match that filter.</p>
      ) : (
        <Table className="mt-6">
          <thead>
            <TableHeaderRow>
              <Th>Reference</Th>
              <Th>Source</Th>
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
                <Td className="text-xs text-mist">{ORIGIN_LABEL[b.origin] ?? b.origin}</Td>
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

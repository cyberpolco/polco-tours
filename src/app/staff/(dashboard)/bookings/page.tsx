import Link from 'next/link';
import type { BookingStatus } from '@prisma/client';
import { requireStaffContext } from '@lib/staff-guard';
import { bookingService } from '@modules/booking';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { formatOrPending } from '@lib/money';
import { BOOKING_STATUS_TONE } from '@lib/status-tones';
import { deleteBookingAction } from './[bookingId]/actions';

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

// Cancelled/refunded bookings are done, dead ends -- clutter for day-to-day
// staff work, so they're excluded from the default "All" view. Still fully
// reachable via their own status-filter pills below (e.g. to find one and
// mark it refunded), just not mixed in with active bookings by default.
const HIDDEN_BY_DEFAULT: BookingStatus[] = ['CANCELLED', 'REFUNDED'];

export default async function BookingsPage({ searchParams }: Props) {
  const ctx = await requireStaffContext('booking.read');
  const { status } = await searchParams;
  const allBookings = await bookingService.list(ctx); // staff -> full org manifest, every source
  const activeBookings = allBookings.filter((b) => !HIDDEN_BY_DEFAULT.includes(b.status));
  const bookings = status ? allBookings.filter((b) => b.status === status) : activeBookings;

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
          All ({activeBookings.length})
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
                  <div className="flex items-center gap-3">
                    <Link href={`/staff/bookings/${b.id}`} className="text-forest hover:underline">
                      View
                    </Link>
                    {/* DR-058: SUPERADMIN-only, any status -- see the detail
                        page's own comment on why this role check (not just
                        the route's booking.delete permission) is the real
                        gate for rendering the control at all. */}
                    {ctx.roles.includes('SUPERADMIN') && (
                      <form action={deleteBookingAction.bind(null, b.id)}>
                        <SubmitButton variant="secondary" size="compact" pendingLabel="Deleting…">
                          Delete
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

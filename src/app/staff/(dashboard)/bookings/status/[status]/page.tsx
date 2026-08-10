import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { BookingStatus } from '@prisma/client';
import { requireStaffContext } from '@lib/staff-guard';
import { bookingService, type BookingView } from '@modules/booking';
import { paginate } from '@lib/directory-filters';
import { BOOKING_STATUS_TONE } from '@lib/status-tones';
import { formatOrPending } from '@lib/money';
import { BackLink } from '@/components/ui/BackLink';
import { Badge } from '@/components/ui/Badge';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { deleteBookingAction } from '../../[bookingId]/actions';
import { FILTERABLE_BOOKING_STATUSES } from '@lib/booking-statuses';

const PER_PAGE = 10;

const ORIGIN_LABEL: Record<string, string> = {
  PREDEFINED_PACKAGE: 'Package',
  TAILOR_MADE: 'Plan my trip',
};

interface Props {
  params: Promise<{ status: string }>;
  searchParams: Promise<{ q?: string; origin?: string; page?: string }>;
}

function matchesQuery(b: BookingView, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return b.bookingReference.toLowerCase().includes(q) || (ORIGIN_LABEL[b.origin] ?? b.origin).toLowerCase().includes(q);
}

export default async function BookingsByStatusPage({ params, searchParams }: Props) {
  const { status: statusParam } = await params;
  if (!(FILTERABLE_BOOKING_STATUSES as string[]).includes(statusParam)) notFound();
  const status = statusParam as BookingStatus;

  const ctx = await requireStaffContext('booking.read');
  const sp = await searchParams;
  const q = sp.q ?? '';
  const origin = sp.origin === 'PREDEFINED_PACKAGE' || sp.origin === 'TAILOR_MADE' ? sp.origin : '';

  const allBookings = await bookingService.list(ctx);
  const statusBookings = allBookings.filter((b) => b.status === status);

  const filtered = statusBookings.filter((b) => {
    if (origin && b.origin !== origin) return false;
    if (!matchesQuery(b, q)) return false;
    return true;
  });
  const { items: bookings, page, totalPages, totalItems } = paginate(filtered, Number(sp.page ?? '1'), PER_PAGE);

  const baseParams: Record<string, string> = {};
  if (q) baseParams.q = q;
  if (origin) baseParams.origin = origin;

  function hrefWith(overrides: Record<string, string | undefined>): string {
    const merged = { ...baseParams, ...overrides };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v) qs.set(k, v);
    }
    const s = qs.toString();
    return s ? `/staff/bookings/status/${status}?${s}` : `/staff/bookings/status/${status}`;
  }

  return (
    <div className="space-y-8">
      <BackLink href="/staff/bookings">back to bookings</BackLink>
      <div className="flex items-center gap-3">
        <PageHeader eyebrow="Bookings" title={status} />
        <Badge tone={BOOKING_STATUS_TONE[status]}>{status}</Badge>
      </div>

      <form method="get" action={`/staff/bookings/status/${status}`} className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <FormField label="Search" htmlFor="q" optional>
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Reference or source"
            className="w-full rounded-survey border border-rule px-3 py-2 text-sm"
          />
        </FormField>
        <FormField label="Source" htmlFor="origin" optional>
          <Select name="origin" defaultValue={origin}>
            <option value="">All</option>
            <option value="PREDEFINED_PACKAGE">Package</option>
            <option value="TAILOR_MADE">Plan my trip</option>
          </Select>
        </FormField>
        <div className="col-span-2 flex items-end gap-3 sm:col-span-1">
          <SubmitButton size="compact">Filter</SubmitButton>
          {(q || origin) && (
            <Link href={`/staff/bookings/status/${status}`} className="text-sm text-mist hover:underline">
              Clear filters
            </Link>
          )}
        </div>
      </form>

      <p className="text-sm text-mist">
        {totalItems} booking{totalItems === 1 ? '' : 's'}
      </p>

      {bookings.length === 0 ? (
        <p className="text-mist">No bookings match these filters.</p>
      ) : (
        <Table>
          <thead>
            <TableHeaderRow>
              <Th>Reference</Th>
              <Th>Source</Th>
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
                <Td>{b.seats}</Td>
                <Td>{formatOrPending(b.priceMinor, b.currency)}</Td>
                <Td>{b.createdAt.toLocaleDateString()}</Td>
                <Td>
                  <div className="flex items-center gap-3">
                    <Link href={`/staff/bookings/${b.id}`} className="text-forest hover:underline">
                      View
                    </Link>
                    {ctx.roles.includes('SUPERADMIN') && (
                      <form action={deleteBookingAction.bind(null, b.id)}>
                        <SubmitButton
                          variant="secondary"
                          size="compact"
                          pendingLabel="Deleting…"
                          confirmMessage={`Delete booking ${b.bookingReference}? This cannot be undone.`}
                        >
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

      <Pagination page={page} totalPages={totalPages} hrefFor={(p) => hrefWith({ page: p === 1 ? undefined : String(p) })} />
    </div>
  );
}

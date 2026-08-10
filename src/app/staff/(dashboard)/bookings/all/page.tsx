import Link from 'next/link';
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
import { deleteBookingAction } from '../[bookingId]/actions';
import { FILTERABLE_BOOKING_STATUSES } from '@lib/booking-statuses';

const PER_PAGE = 10;

const ORIGIN_LABEL: Record<string, string> = {
  PREDEFINED_PACKAGE: 'Package',
  TAILOR_MADE: 'Plan my trip',
};

interface Props {
  searchParams: Promise<{ q?: string; status?: string; origin?: string; page?: string }>;
}

function matchesQuery(b: BookingView, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return b.bookingReference.toLowerCase().includes(q) || (ORIGIN_LABEL[b.origin] ?? b.origin).toLowerCase().includes(q);
}

export default async function AllBookingsPage({ searchParams }: Props) {
  const ctx = await requireStaffContext('booking.read');
  const params = await searchParams;
  const q = params.q ?? '';
  const status = (FILTERABLE_BOOKING_STATUSES as string[]).includes(params.status ?? '') ? (params.status as BookingStatus) : '';
  const origin = params.origin === 'PREDEFINED_PACKAGE' || params.origin === 'TAILOR_MADE' ? params.origin : '';

  const allBookings = await bookingService.list(ctx);

  const filtered = allBookings.filter((b) => {
    if (status && b.status !== status) return false;
    if (origin && b.origin !== origin) return false;
    if (!matchesQuery(b, q)) return false;
    return true;
  });
  const { items: bookings, page, totalPages, totalItems } = paginate(filtered, Number(params.page ?? '1'), PER_PAGE);

  const baseParams: Record<string, string> = {};
  if (q) baseParams.q = q;
  if (status) baseParams.status = status;
  if (origin) baseParams.origin = origin;

  function hrefWith(overrides: Record<string, string | undefined>): string {
    const merged = { ...baseParams, ...overrides };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v) qs.set(k, v);
    }
    const s = qs.toString();
    return s ? `/staff/bookings/all?${s}` : '/staff/bookings/all';
  }

  return (
    <div className="space-y-8">
      <BackLink href="/staff/bookings">back to bookings</BackLink>
      <PageHeader eyebrow="Bookings" title="All Bookings" />

      <form method="get" action="/staff/bookings/all" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <FormField label="Search" htmlFor="q" optional>
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Reference or source"
            className="w-full rounded-survey border border-rule px-3 py-2 text-sm"
          />
        </FormField>
        <FormField label="Status" htmlFor="status" optional>
          <Select name="status" defaultValue={status}>
            <option value="">All</option>
            {FILTERABLE_BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
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
          {(q || status || origin) && (
            <Link href="/staff/bookings/all" className="text-sm text-mist hover:underline">
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

import Link from 'next/link';
import type { BookingStatus, ItineraryStatus } from '@prisma/client';
import { requireStaffContext } from '@lib/staff-guard';
import { bookingService, type BookingView } from '@modules/booking';
import { itineraryService, type ItineraryView } from '@modules/itinerary';
import { paginate } from '@lib/directory-filters';
import { Badge } from '@/components/ui/Badge';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { BOOKING_STATUS_TONE, ITINERARY_STATUS_TONE } from '@lib/status-tones';

const PER_PAGE = 10;

const ITINERARY_STATUSES: ItineraryStatus[] = ['DRAFT', 'IN_REVIEW', 'APPROVED'];
const BOOKING_STATUSES: BookingStatus[] = [
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

interface Row {
  itinerary: ItineraryView;
  booking: BookingView | null;
}

function matchesQuery(row: Row, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return row.booking?.bookingReference.toLowerCase().includes(q) ?? false;
}

interface Props {
  searchParams: Promise<{ q?: string; itineraryStatus?: string; bookingStatus?: string; page?: string }>;
}

// Manager-only (itinerary.write) -- the entry point for reaching a specific
// itinerary is normally a booking's detail page ("Create itinerary"); this
// list is for browsing everything already created, mirroring the DR-028
// staff/packages list convention. DR-100: search/filter/pagination added,
// same DR-091/095/097/098/099 convention -- no card-hub split, since an
// itinerary's own status (DRAFT/IN_REVIEW/APPROVED) is a small enough set
// that a filter dropdown reads better than three near-empty cards.
export default async function ItinerariesPage({ searchParams }: Props) {
  const ctx = await requireStaffContext('itinerary.write');
  const params = await searchParams;
  const q = params.q ?? '';
  const itineraryStatus = (ITINERARY_STATUSES as string[]).includes(params.itineraryStatus ?? '')
    ? (params.itineraryStatus as ItineraryStatus)
    : '';
  const bookingStatus = (BOOKING_STATUSES as string[]).includes(params.bookingStatus ?? '')
    ? (params.bookingStatus as BookingStatus)
    : '';

  const allItineraries = await itineraryService.listAll(ctx);
  // DR-058: a soft-deleted Booking is untouched (not hard-deleted) until the
  // retention purge, so an Itinerary can still point at one for up to 90
  // days -- bookingService.getById now throws for it (getOwnedBooking's
  // findById returns null, which getById turns into a 404), where it never
  // used to before soft-delete existed. This page's own JSX already treats
  // a missing booking as "—" (see below); catch here so it actually gets
  // that chance instead of one bad itinerary crashing the whole list.
  const allBookings = await Promise.all(
    allItineraries.map((i) => bookingService.getById(ctx, i.bookingId).catch(() => null)),
  );
  // DR-049: no longer hidden -- convertToItinerary only requires a sent
  // quotation (priced), not an accepted one, so an Itinerary can exist for a
  // booking still awaiting the guest's acceptance; the booking's own status
  // badge makes that visible instead of hiding the row.
  const allRows: Row[] = allItineraries.map((itinerary, i) => ({ itinerary, booking: allBookings[i] ?? null }));

  const filtered = allRows.filter((row) => {
    if (itineraryStatus && row.itinerary.status !== itineraryStatus) return false;
    if (bookingStatus && row.booking?.status !== bookingStatus) return false;
    if (!matchesQuery(row, q)) return false;
    return true;
  });
  const { items: rows, page, totalPages, totalItems } = paginate(filtered, Number(params.page ?? '1'), PER_PAGE);

  const baseParams: Record<string, string> = {};
  if (q) baseParams.q = q;
  if (itineraryStatus) baseParams.itineraryStatus = itineraryStatus;
  if (bookingStatus) baseParams.bookingStatus = bookingStatus;

  function hrefWith(overrides: Record<string, string | undefined>): string {
    const merged = { ...baseParams, ...overrides };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v) qs.set(k, v);
    }
    const s = qs.toString();
    return s ? `/staff/itineraries?${s}` : '/staff/itineraries';
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Itineraries" title="Operational plans" />

      <form method="get" action="/staff/itineraries" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <FormField label="Search" htmlFor="q" optional>
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Booking reference"
            className="w-full rounded-survey border border-rule px-3 py-2 text-sm"
          />
        </FormField>
        <FormField label="Itinerary status" htmlFor="itineraryStatus" optional>
          <Select name="itineraryStatus" defaultValue={itineraryStatus}>
            <option value="">All</option>
            {ITINERARY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Booking status" htmlFor="bookingStatus" optional>
          <Select name="bookingStatus" defaultValue={bookingStatus}>
            <option value="">All</option>
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="col-span-2 flex items-end gap-3 sm:col-span-1">
          <SubmitButton size="compact">Filter</SubmitButton>
          {(q || itineraryStatus || bookingStatus) && (
            <Link href="/staff/itineraries" className="text-sm text-mist hover:underline">
              Clear filters
            </Link>
          )}
        </div>
      </form>

      <p className="text-sm text-mist">
        {totalItems} itinerar{totalItems === 1 ? 'y' : 'ies'}
      </p>

      {rows.length === 0 ? (
        <p className="text-mist">
          {totalItems === 0 && !q && !itineraryStatus && !bookingStatus
            ? "No itineraries created yet -- create one from a booking's detail page."
            : 'No itineraries match these filters.'}
        </p>
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

      <Pagination page={page} totalPages={totalPages} hrefFor={(p) => hrefWith({ page: p === 1 ? undefined : String(p) })} />
    </div>
  );
}

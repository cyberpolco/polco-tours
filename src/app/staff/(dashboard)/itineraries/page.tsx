import Link from 'next/link';
import type { BookingStatus, ItineraryStatus } from '@prisma/client';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { bookingService, type BookingView } from '@modules/booking';
import { itineraryService, type ItineraryView } from '@modules/itinerary';
import { paginate } from '@lib/directory-filters';
import { Badge } from '@/components/ui/Badge';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { Reveal } from '@/components/ui/Reveal';
import { SearchField } from '@/components/ui/SearchField';
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
  const t = await getTranslations('StaffItinerariesPage');
  const tBookingStatus = await getTranslations('BookingStatusLabel');
  const tItineraryStatus = await getTranslations('ItineraryStatusLabel');
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
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} />

      <Reveal>
        <div className="space-y-6">
          <form method="get" action="/staff/itineraries" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <FormField label={t('search')} htmlFor="q" optional>
              <SearchField name="q" defaultValue={q} placeholder={t('searchPlaceholder')} />
            </FormField>
            <FormField label={t('itineraryStatus')} htmlFor="itineraryStatus" optional>
              <Select name="itineraryStatus" defaultValue={itineraryStatus}>
                <option value="">{t('all')}</option>
                {ITINERARY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {tItineraryStatus(s)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={t('bookingStatus')} htmlFor="bookingStatus" optional>
              <Select name="bookingStatus" defaultValue={bookingStatus}>
                <option value="">{t('all')}</option>
                {BOOKING_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {tBookingStatus(s)}
                  </option>
                ))}
              </Select>
            </FormField>
            <div className="col-span-2 flex items-end gap-3 sm:col-span-1">
              <SubmitButton size="compact">{t('filter')}</SubmitButton>
              {(q || itineraryStatus || bookingStatus) && (
                <Link href="/staff/itineraries" className="text-sm text-mist hover:underline">
                  {t('clearFilters')}
                </Link>
              )}
            </div>
          </form>

          <p className="text-sm text-mist">{t('itineraryCount', { count: totalItems })}</p>

          {rows.length === 0 ? (
            <p className="text-mist">
              {totalItems === 0 && !q && !itineraryStatus && !bookingStatus ? t('noItinerariesYet') : t('noMatches')}
            </p>
          ) : (
            <Table>
              <thead>
                <TableHeaderRow>
                  <Th>{t('booking')}</Th>
                  <Th>{t('bookingStatus')}</Th>
                  <Th>{t('itineraryStatus')}</Th>
                  <Th />
                </TableHeaderRow>
              </thead>
              <tbody>
                {rows.map(({ itinerary, booking }) => (
                  <Tr key={itinerary.id}>
                    <Td>{booking?.bookingReference ?? itinerary.bookingId}</Td>
                    <Td>
                      {booking ? <Badge tone={BOOKING_STATUS_TONE[booking.status]}>{tBookingStatus(booking.status)}</Badge> : '—'}
                    </Td>
                    <Td>
                      <Badge tone={ITINERARY_STATUS_TONE[itinerary.status]}>{tItineraryStatus(itinerary.status)}</Badge>
                    </Td>
                    <Td>
                      <Link href={`/staff/itineraries/${itinerary.id}`} className="text-forest hover:underline">
                        {t('open')}
                      </Link>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}

          <Pagination page={page} totalPages={totalPages} hrefFor={(p) => hrefWith({ page: p === 1 ? undefined : String(p) })} />
        </div>
      </Reveal>
    </div>
  );
}

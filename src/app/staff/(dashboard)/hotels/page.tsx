import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { can } from '@lib/rbac';
import { itineraryService, type HotelView } from '@modules/itinerary';
import { paginate } from '@lib/directory-filters';
import { FormField } from '@/components/ui/FormField';
import { LinkButton } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { SearchField } from '@/components/ui/SearchField';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';

const PER_PAGE = 10;

interface Props {
  searchParams: Promise<{ q?: string; country?: string; page?: string }>;
}

function matchesQuery(h: HotelView, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    h.name.toLowerCase().includes(q) ||
    (h.address?.toLowerCase().includes(q) ?? false) ||
    (h.contactName?.toLowerCase().includes(q) ?? false) ||
    (h.contactEmail?.toLowerCase().includes(q) ?? false) ||
    (h.contactPhone?.toLowerCase().includes(q) ?? false)
  );
}

function listCountries(hotels: HotelView[]): string[] {
  return [...new Set(hotels.map((h) => h.country))].sort();
}

// Lightweight reusable reference entities (Itinerary Management, DR-033) --
// name + contact info only, no compliance tracking like the fleet module.
// DR-083: broadened from itinerary.write-only so TOUR_GUIDE/DRIVER
// (itinerary.read + hotel_restaurant_rating.write, no itinerary.write) can
// reach here to rate a hotel -- rating moved off the itinerary page onto
// this one. Non-managers see only hotels they've actually toured
// (anti-BOLA, same scope rateHotel itself enforces), not the whole org list.
// DR-099: search/filter/pagination added on top of that same access-scoped
// list, same DR-091/095/097/098 convention.
export default async function HotelsPage({ searchParams }: Props) {
  const ctx = await requireStaffContext('itinerary.read');
  const canWrite = can(ctx, 'itinerary.write');
  const canRate = can(ctx, 'hotel_restaurant_rating.write');
  const params = await searchParams;
  const t = await getTranslations('StaffHotels');
  const tFields = await getTranslations('PlaceFields');
  const tCountries = await getTranslations('Countries');
  const q = params.q ?? '';
  const country = params.country ?? '';

  let allHotels = await itineraryService.listHotels(ctx);
  if (!canWrite) {
    const rateableIds = new Set(await itineraryService.listMyRateableHotelIds(ctx));
    allHotels = allHotels.filter((h) => rateableIds.has(h.id));
  }
  const countryOptions = listCountries(allHotels);

  const filtered = allHotels.filter((h) => {
    if (country && h.country !== country) return false;
    if (!matchesQuery(h, q)) return false;
    return true;
  });
  const { items: hotels, page, totalPages, totalItems } = paginate(filtered, Number(params.page ?? '1'), PER_PAGE);

  const baseParams: Record<string, string> = {};
  if (q) baseParams.q = q;
  if (country) baseParams.country = country;

  function hrefWith(overrides: Record<string, string | undefined>): string {
    const merged = { ...baseParams, ...overrides };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v) qs.set(k, v);
    }
    const s = qs.toString();
    return s ? `/staff/hotels?${s}` : '/staff/hotels';
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader eyebrow={t('eyebrow')} title={t('title')} />
        {canWrite && <LinkButton href="/staff/hotels/new">{t('addHotel')}</LinkButton>}
      </div>

      <form method="get" action="/staff/hotels" className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <FormField label={tFields('search')} htmlFor="q" optional>
          <SearchField name="q" defaultValue={q} placeholder={t('searchPlaceholder')} />
        </FormField>
        <FormField label={tFields('country')} htmlFor="country" optional>
          <Select name="country" defaultValue={country}>
            <option value="">{tFields('all')}</option>
            {countryOptions.map((c) => (
              <option key={c} value={c}>
                {tCountries(c)}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="col-span-2 flex items-end gap-3 sm:col-span-1">
          <SubmitButton size="compact">{tFields('filter')}</SubmitButton>
          {(q || country) && (
            <Link href="/staff/hotels" className="text-sm text-mist hover:underline">
              {tFields('clearFilters')}
            </Link>
          )}
        </div>
      </form>

      <p className="text-sm text-mist">{t('hotelCount', { count: totalItems })}</p>

      {hotels.length === 0 ? (
        <p className="text-mist">
          {totalItems === 0 && !q && !country ? (canWrite ? t('noneRegistered') : t('noneToRate')) : t('noMatches')}
        </p>
      ) : (
        <Table>
          <thead>
            <TableHeaderRow>
              <Th>{tFields('name')}</Th>
              <Th>{tFields('country')}</Th>
              <Th>{tFields('address')}</Th>
              <Th>{t('contactCol')}</Th>
              <Th>{t('ratingCol')}</Th>
              <Th />
            </TableHeaderRow>
          </thead>
          <tbody>
            {hotels.map((h) => (
              <Tr key={h.id}>
                <Td>{h.name}</Td>
                <Td>{tCountries(h.country)}</Td>
                <Td>{h.address ?? '—'}</Td>
                <Td>{h.contactPhone ?? h.contactEmail ?? '—'}</Td>
                <Td>{h.averageRating != null ? tFields('ratedSummary', { rating: h.averageRating.toFixed(1), count: h.ratingCount }) : '—'}</Td>
                <Td>
                  <Link href={`/staff/hotels/${h.id}`} className="text-forest hover:underline">
                    {canWrite ? tFields('edit') : canRate ? tFields('rate') : tFields('view')}
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

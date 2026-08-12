import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { can } from '@lib/rbac';
import { itineraryService, type RestaurantView } from '@modules/itinerary';
import { paginate } from '@lib/directory-filters';
import { FormField } from '@/components/ui/FormField';
import { LinkButton } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';

const PER_PAGE = 10;

interface Props {
  searchParams: Promise<{ q?: string; country?: string; page?: string }>;
}

function matchesQuery(r: RestaurantView, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    r.name.toLowerCase().includes(q) ||
    (r.address?.toLowerCase().includes(q) ?? false) ||
    (r.contactName?.toLowerCase().includes(q) ?? false) ||
    (r.contactEmail?.toLowerCase().includes(q) ?? false) ||
    (r.contactPhone?.toLowerCase().includes(q) ?? false)
  );
}

function listCountries(restaurants: RestaurantView[]): string[] {
  return [...new Set(restaurants.map((r) => r.country))].sort();
}

// Lightweight reusable reference entities (Itinerary Management, DR-033) --
// name + contact info only, no compliance tracking like the fleet module.
// DR-083: restaurant counterpart to hotels/page.tsx -- identical shape/rules.
// DR-099: search/filter/pagination added on top of that same access-scoped
// list, same DR-091/095/097/098 convention.
export default async function RestaurantsPage({ searchParams }: Props) {
  const ctx = await requireStaffContext('itinerary.read');
  const canWrite = can(ctx, 'itinerary.write');
  const canRate = can(ctx, 'hotel_restaurant_rating.write');
  const params = await searchParams;
  const t = await getTranslations('StaffRestaurants');
  const tFields = await getTranslations('PlaceFields');
  const tCountries = await getTranslations('Countries');
  const q = params.q ?? '';
  const country = params.country ?? '';

  let allRestaurants = await itineraryService.listRestaurants(ctx);
  if (!canWrite) {
    const rateableIds = new Set(await itineraryService.listMyRateableRestaurantIds(ctx));
    allRestaurants = allRestaurants.filter((r) => rateableIds.has(r.id));
  }
  const countryOptions = listCountries(allRestaurants);

  const filtered = allRestaurants.filter((r) => {
    if (country && r.country !== country) return false;
    if (!matchesQuery(r, q)) return false;
    return true;
  });
  const { items: restaurants, page, totalPages, totalItems } = paginate(filtered, Number(params.page ?? '1'), PER_PAGE);

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
    return s ? `/staff/restaurants?${s}` : '/staff/restaurants';
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader eyebrow={t('eyebrow')} title={t('title')} />
        {canWrite && <LinkButton href="/staff/restaurants/new">{t('addRestaurant')}</LinkButton>}
      </div>

      <form method="get" action="/staff/restaurants" className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <FormField label={tFields('search')} htmlFor="q" optional>
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder={t('searchPlaceholder')}
            className="w-full rounded-survey border border-rule px-3 py-2 text-sm"
          />
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
            <Link href="/staff/restaurants" className="text-sm text-mist hover:underline">
              {tFields('clearFilters')}
            </Link>
          )}
        </div>
      </form>

      <p className="text-sm text-mist">{t('restaurantCount', { count: totalItems })}</p>

      {restaurants.length === 0 ? (
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
            {restaurants.map((r) => (
              <Tr key={r.id}>
                <Td>{r.name}</Td>
                <Td>{tCountries(r.country)}</Td>
                <Td>{r.address ?? '—'}</Td>
                <Td>{r.contactPhone ?? r.contactEmail ?? '—'}</Td>
                <Td>
                  {r.averageRating != null ? tFields('ratedSummary', { rating: r.averageRating.toFixed(1), count: r.ratingCount }) : '—'}
                </Td>
                <Td>
                  <Link href={`/staff/restaurants/${r.id}`} className="text-forest hover:underline">
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

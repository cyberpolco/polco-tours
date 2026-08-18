import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { catalogService, isPublishedStatus, type TourPackageView } from '@modules/catalog';
import { paginate } from '@lib/directory-filters';
import { PACKAGE_STATUS_TONE } from '@lib/status-tones';
import { BackLink } from '@/components/ui/BackLink';
import { Badge } from '@/components/ui/Badge';
import { LinkButton } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { Reveal } from '@/components/ui/Reveal';
import { SearchField } from '@/components/ui/SearchField';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { formatOrPending } from '@lib/money';

const PER_PAGE = 10;

interface Props {
  searchParams: Promise<{ q?: string; country?: string; status?: string; page?: string }>;
}

function matchesQuery(p: TourPackageView, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    p.title.toLowerCase().includes(q) ||
    p.packageReference.toLowerCase().includes(q) ||
    // DR-114: countries[] always includes the primary country, so checking
    // it alone covers a combo package's other countries too.
    p.countries.some((c) => c.toLowerCase().includes(q))
  );
}

function listCountries(packages: TourPackageView[]): string[] {
  // DR-114: every country a package touches, not just its primary one --
  // staff filtering by "Zambia" should surface a Zambia+Zimbabwe combo too.
  return [...new Set(packages.flatMap((p) => p.countries))].sort();
}

export default async function PublicPackagesPage({ searchParams }: Props) {
  const ctx = await requireStaffContext('catalog.read');
  const params = await searchParams;
  const t = await getTranslations('StaffPackages');
  const tCountries = await getTranslations('Countries');
  const tPackageStatus = await getTranslations('PackageStatusLabel');
  const q = params.q ?? '';
  const country = params.country ?? '';
  // DR-117: filter within the two published sub-statuses -- this list only
  // ever contains PUBLISHED_AVAILABLE/PUBLISHED_UNAVAILABLE rows to begin
  // with, so an invalid/foreign value here just means "no status filter".
  const status = params.status === 'PUBLISHED_AVAILABLE' || params.status === 'PUBLISHED_UNAVAILABLE' ? params.status : '';

  const allPackages = await catalogService.listPackages(ctx);
  const publicPackages = allPackages.filter((p) => isPublishedStatus(p.status));
  const countryOptions = listCountries(publicPackages);

  const filtered = publicPackages.filter((p) => {
    if (country && !p.countries.includes(country)) return false;
    if (status && p.status !== status) return false;
    if (!matchesQuery(p, q)) return false;
    return true;
  });
  const { items: packages, page, totalPages, totalItems } = paginate(filtered, Number(params.page ?? '1'), PER_PAGE);

  const baseParams: Record<string, string> = {};
  if (q) baseParams.q = q;
  if (country) baseParams.country = country;
  if (status) baseParams.status = status;

  function hrefWith(overrides: Record<string, string | undefined>): string {
    const merged = { ...baseParams, ...overrides };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v) qs.set(k, v);
    }
    const s = qs.toString();
    return s ? `/staff/packages/public?${s}` : '/staff/packages/public';
  }

  return (
    <div className="space-y-8">
      <BackLink href="/staff/packages">{t('backToPackages')}</BackLink>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader eyebrow={t('eyebrow')} title={t('publicTitle')} />
        <LinkButton href="/staff/packages/new">{t('newPackage')}</LinkButton>
      </div>

      <Reveal>
        <div className="space-y-8">
          <form method="get" action="/staff/packages/public" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <FormField label={t('search')} htmlFor="q" optional>
              <SearchField name="q" defaultValue={q} placeholder={t('searchPlaceholder')} />
            </FormField>
            <FormField label={t('country')} htmlFor="country" optional>
              <Select name="country" defaultValue={country}>
                <option value="">{t('all')}</option>
                {countryOptions.map((c) => (
                  <option key={c} value={c}>
                    {tCountries(c)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={t('status')} htmlFor="status" optional>
              <Select name="status" defaultValue={status}>
                <option value="">{t('all')}</option>
                <option value="PUBLISHED_AVAILABLE">{t('available')}</option>
                <option value="PUBLISHED_UNAVAILABLE">{t('unavailable')}</option>
              </Select>
            </FormField>
            <div className="col-span-2 flex items-end gap-3 sm:col-span-1">
              <SubmitButton size="compact">{t('filter')}</SubmitButton>
              {(q || country || status) && (
                <Link href="/staff/packages/public" className="text-sm text-mist hover:underline">
                  {t('clearFilters')}
                </Link>
              )}
            </div>
          </form>

          <p className="text-sm text-mist">{t('packageCount', { count: totalItems })}</p>

          {packages.length === 0 ? (
            <p className="text-mist">{t('noPublicMatches')}</p>
          ) : (
            <Table>
              <thead>
                <TableHeaderRow>
                  <Th>{t('reference')}</Th>
                  <Th>{t('packageTitle')}</Th>
                  <Th>{t('country')}</Th>
                  <Th>{t('price')}</Th>
                  <Th>{t('status')}</Th>
                  <Th />
                </TableHeaderRow>
              </thead>
              <tbody>
                {packages.map((p) => (
                  <Tr key={p.id}>
                    <Td className="font-mono text-xs">{p.packageReference}</Td>
                    <Td>{p.title}</Td>
                    <Td>{p.countries.map((c) => tCountries(c)).join(' + ')}</Td>
                    <Td>{formatOrPending(p.priceMinor, p.currency, t('notYetPriced'))}</Td>
                    <Td>
                      <Badge tone={PACKAGE_STATUS_TONE[p.status]}>{tPackageStatus(p.status)}</Badge>
                    </Td>
                    <Td>
                      <Link href={`/staff/packages/${p.id}`} className="text-forest hover:underline">
                        {t('view')}
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

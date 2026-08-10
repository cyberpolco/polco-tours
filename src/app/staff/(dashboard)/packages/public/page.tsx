import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { catalogService, type TourPackageView } from '@modules/catalog';
import { paginate } from '@lib/directory-filters';
import { PACKAGE_STATUS_TONE } from '@lib/status-tones';
import { BackLink } from '@/components/ui/BackLink';
import { Badge } from '@/components/ui/Badge';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { formatOrPending } from '@lib/money';

const PER_PAGE = 10;

interface Props {
  searchParams: Promise<{ q?: string; country?: string; page?: string }>;
}

function matchesQuery(p: TourPackageView, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    p.title.toLowerCase().includes(q) || p.packageReference.toLowerCase().includes(q) || p.country.toLowerCase().includes(q)
  );
}

function listCountries(packages: TourPackageView[]): string[] {
  return [...new Set(packages.map((p) => p.country))].sort();
}

export default async function PublicPackagesPage({ searchParams }: Props) {
  const ctx = await requireStaffContext('catalog.read');
  const params = await searchParams;
  const q = params.q ?? '';
  const country = params.country ?? '';

  const allPackages = await catalogService.listPackages(ctx);
  const publicPackages = allPackages.filter((p) => p.status === 'PUBLISHED');
  const countryOptions = listCountries(publicPackages);

  const filtered = publicPackages.filter((p) => {
    if (country && p.country !== country) return false;
    if (!matchesQuery(p, q)) return false;
    return true;
  });
  const { items: packages, page, totalPages, totalItems } = paginate(filtered, Number(params.page ?? '1'), PER_PAGE);

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
    return s ? `/staff/packages/public?${s}` : '/staff/packages/public';
  }

  return (
    <div className="space-y-8">
      <BackLink href="/staff/packages">back to packages</BackLink>
      <PageHeader eyebrow="Packages" title="Public Packages" />

      <form method="get" action="/staff/packages/public" className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <FormField label="Search" htmlFor="q" optional>
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Title, reference, or country"
            className="w-full rounded-survey border border-rule px-3 py-2 text-sm"
          />
        </FormField>
        <FormField label="Country" htmlFor="country" optional>
          <Select name="country" defaultValue={country}>
            <option value="">All</option>
            {countryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="col-span-2 flex items-end gap-3 sm:col-span-1">
          <SubmitButton size="compact">Filter</SubmitButton>
          {(q || country) && (
            <Link href="/staff/packages/public" className="text-sm text-mist hover:underline">
              Clear filters
            </Link>
          )}
        </div>
      </form>

      <p className="text-sm text-mist">
        {totalItems} package{totalItems === 1 ? '' : 's'}
      </p>

      {packages.length === 0 ? (
        <p className="text-mist">No public packages match these filters.</p>
      ) : (
        <Table>
          <thead>
            <TableHeaderRow>
              <Th>Reference</Th>
              <Th>Title</Th>
              <Th>Country</Th>
              <Th>Price</Th>
              <Th>Status</Th>
              <Th />
            </TableHeaderRow>
          </thead>
          <tbody>
            {packages.map((p) => (
              <Tr key={p.id}>
                <Td className="font-mono text-xs">{p.packageReference}</Td>
                <Td>{p.title}</Td>
                <Td>{p.country}</Td>
                <Td>{formatOrPending(p.priceMinor, p.currency, 'Not yet priced')}</Td>
                <Td>
                  <Badge tone={PACKAGE_STATUS_TONE[p.status]}>{p.status}</Badge>
                </Td>
                <Td>
                  <Link href={`/staff/packages/${p.id}`} className="text-forest hover:underline">
                    View
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

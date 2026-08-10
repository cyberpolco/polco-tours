import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { catalogService, type TourPackageView } from '@modules/catalog';
import { paginate } from '@lib/directory-filters';
import { PACKAGE_STATUS_TONE } from '@lib/status-tones';
import { BackLink } from '@/components/ui/BackLink';
import { Badge } from '@/components/ui/Badge';
import { LinkButton } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { formatOrPending } from '@lib/money';

const PER_PAGE = 10;

interface Props {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}

function matchesQuery(p: TourPackageView, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    p.title.toLowerCase().includes(q) || p.packageReference.toLowerCase().includes(q) || p.country.toLowerCase().includes(q)
  );
}

// DR-097: "Customized" == not currently visible to any guest --
// isPackageVisible only ever shows PUBLISHED; DRAFT and ARCHIVED both land
// here, distinguishable via the Status filter below.
export default async function CustomizedPackagesPage({ searchParams }: Props) {
  const ctx = await requireStaffContext('catalog.read');
  const params = await searchParams;
  const q = params.q ?? '';
  const status = params.status === 'DRAFT' || params.status === 'ARCHIVED' ? params.status : '';

  const allPackages = await catalogService.listPackages(ctx);
  const customizedPackages = allPackages.filter((p) => p.status !== 'PUBLISHED');

  const filtered = customizedPackages.filter((p) => {
    if (status && p.status !== status) return false;
    if (!matchesQuery(p, q)) return false;
    return true;
  });
  const { items: packages, page, totalPages, totalItems } = paginate(filtered, Number(params.page ?? '1'), PER_PAGE);

  const baseParams: Record<string, string> = {};
  if (q) baseParams.q = q;
  if (status) baseParams.status = status;

  function hrefWith(overrides: Record<string, string | undefined>): string {
    const merged = { ...baseParams, ...overrides };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v) qs.set(k, v);
    }
    const s = qs.toString();
    return s ? `/staff/packages/customized?${s}` : '/staff/packages/customized';
  }

  return (
    <div className="space-y-8">
      <BackLink href="/staff/packages">back to packages</BackLink>
      <div className="flex items-center justify-between">
        <PageHeader eyebrow="Packages" title="Customized Packages" />
        <LinkButton href="/staff/packages/new">New package</LinkButton>
      </div>
      <p className="-mt-4 text-sm text-mist">Draft or archived -- staff-only, never shown on the guest site.</p>

      <form method="get" action="/staff/packages/customized" className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <FormField label="Search" htmlFor="q" optional>
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Title, reference, or country"
            className="w-full rounded-survey border border-rule px-3 py-2 text-sm"
          />
        </FormField>
        <FormField label="Status" htmlFor="status" optional>
          <Select name="status" defaultValue={status}>
            <option value="">All</option>
            <option value="DRAFT">Draft</option>
            <option value="ARCHIVED">Archived</option>
          </Select>
        </FormField>
        <div className="col-span-2 flex items-end gap-3 sm:col-span-1">
          <SubmitButton size="compact">Filter</SubmitButton>
          {(q || status) && (
            <Link href="/staff/packages/customized" className="text-sm text-mist hover:underline">
              Clear filters
            </Link>
          )}
        </div>
      </form>

      <p className="text-sm text-mist">
        {totalItems} package{totalItems === 1 ? '' : 's'}
      </p>

      {packages.length === 0 ? (
        <p className="text-mist">No customized packages match these filters.</p>
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

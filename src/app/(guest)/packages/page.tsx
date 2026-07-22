import Link from 'next/link';
import { catalogService } from '@modules/catalog';
import { Reveal } from '@/components/ui/Reveal';
import { PackageCard } from '../package-card';

interface Props {
  searchParams: Promise<{ country?: string; q?: string }>;
}

const COUNTRIES = [
  { code: 'NA', name: 'Namibia' },
  { code: 'CD', name: 'DR Congo' },
  { code: 'ZM', name: 'Zambia' },
  { code: 'ZW', name: 'Zimbabwe' },
];

export default async function PackagesPage({ searchParams }: Props) {
  const { country, q } = await searchParams;
  const packages = await catalogService.listPublicPackages({ country, search: q });

  function pillHref(nextCountry?: string): string {
    const params = new URLSearchParams();
    if (nextCountry) params.set('country', nextCountry);
    if (q) params.set('q', q);
    const query = params.toString();
    return query ? `/packages?${query}` : '/packages';
  }

  return (
    <div>
      <p className="eyebrow text-mist">Browse</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">Tour packages</h1>

      <Reveal>
        <form method="get" action="/packages" className="mt-6 flex flex-wrap items-center gap-3">
          {country && <input type="hidden" name="country" value={country} />}
          <input
            type="search"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Search packages…"
            className="w-full max-w-xs rounded-pill border border-rule px-4 py-1.5 text-sm transition-colors focus:border-amber focus:outline-none sm:w-auto"
          />
          <button
            type="submit"
            className="rounded-pill border border-navy px-4 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-navy hover:text-bone"
          >
            Search
          </button>
        </form>

        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <Link
            href={pillHref(undefined)}
            className={`rounded-pill border px-3 py-1 transition-colors ${
              !country ? 'border-amber bg-amber text-navy font-semibold' : 'border-rule text-ink hover:border-navy'
            }`}
          >
            All
          </Link>
          {COUNTRIES.map((c) => (
            <Link
              key={c.code}
              href={pillHref(c.code)}
              className={`rounded-pill border px-3 py-1 transition-colors ${
                country === c.code ? 'border-amber bg-amber text-navy font-semibold' : 'border-rule text-ink hover:border-navy'
              }`}
            >
              {c.name}
            </Link>
          ))}
        </div>
      </Reveal>

      {packages.length === 0 ? (
        <p className="mt-6 text-mist">No packages match that filter yet.</p>
      ) : (
        <Reveal delay={0.1}>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {packages.map((p) => (
              <PackageCard key={p.id} pkg={p} />
            ))}
          </ul>
        </Reveal>
      )}
    </div>
  );
}

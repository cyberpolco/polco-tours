import Link from 'next/link';
import { catalogService } from '@modules/catalog';
import { PackageCard } from '../package-card';

interface Props {
  searchParams: Promise<{ country?: string }>;
}

const COUNTRIES = [
  { code: 'NA', name: 'Namibia' },
  { code: 'CD', name: 'DR Congo' },
];

export default async function PackagesPage({ searchParams }: Props) {
  const { country } = await searchParams;
  const all = await catalogService.listPublicPackages();
  const packages = country ? all.filter((p) => p.country === country) : all;

  return (
    <div>
      <p className="eyebrow text-mist">Browse</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">Tour packages</h1>

      <div className="mt-4 flex gap-2 text-sm">
        <Link
          href="/packages"
          className={`rounded-survey border border-rule px-3 py-1 ${!country ? 'bg-navy text-bone' : 'text-ink'}`}
        >
          All
        </Link>
        {COUNTRIES.map((c) => (
          <Link
            key={c.code}
            href={`/packages?country=${c.code}`}
            className={`rounded-survey border border-rule px-3 py-1 ${country === c.code ? 'bg-navy text-bone' : 'text-ink'}`}
          >
            {c.name}
          </Link>
        ))}
      </div>

      {packages.length === 0 ? (
        <p className="mt-6 text-mist">No packages match that filter yet.</p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {packages.map((p) => (
            <PackageCard key={p.id} pkg={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

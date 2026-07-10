import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { catalogService } from '@modules/catalog';
import { format, money } from '@lib/money';

interface Props {
  searchParams: Promise<{ packageId?: string }>;
}

// Server-rendered, query-param-driven browse (same convention as
// bookings/new/page.tsx's package -> departure drill-down) -- the first
// staff-facing departures UI in the repo (previously API-only, a gap DR-016
// flagged). Read-only browse; assignment management lives on the detail page.
export default async function DeparturesPage({ searchParams }: Props) {
  const ctx = await requireStaffContext('assignment.write');
  const { packageId } = await searchParams;

  if (packageId) {
    const departures = await catalogService.listDepartures(ctx, packageId);
    return (
      <div>
        <p className="text-xs tracking-survey text-mist">DEPARTURES</p>
        {departures.length === 0 ? (
          <p className="mt-4 text-mist">No departures scheduled for this package.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {departures.map((d) => (
              <li key={d.id}>
                <Link href={`/staff/departures/${d.id}`} className="text-forest hover:underline">
                  {d.startDate.toLocaleDateString()} · capacity {d.capacity} · {d.status}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/staff/departures" className="mt-4 inline-block text-sm text-forest hover:underline">
          ← back
        </Link>
      </div>
    );
  }

  const packages = await catalogService.listPackages(ctx);
  return (
    <div>
      <p className="text-xs tracking-survey text-mist">DEPARTURES · CHOOSE PACKAGE</p>
      {packages.length === 0 ? (
        <p className="mt-4 text-mist">No packages yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {packages.map((p) => (
            <li key={p.id}>
              <Link href={`/staff/departures?packageId=${p.id}`} className="text-forest hover:underline">
                {p.title} · {p.country} · {format(money(p.priceMinor, p.currency))}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

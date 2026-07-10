import Link from 'next/link';
import { notFound } from 'next/navigation';
import { catalogService, effectivePrice, isBookable } from '@modules/catalog';
import { format } from '@lib/money';

interface Props {
  params: Promise<{ packageId: string }>;
}

export default async function PackageDetailPage({ params }: Props) {
  const { packageId } = await params;

  let detail;
  try {
    detail = await catalogService.getPublicPackageWithDepartures(packageId);
  } catch {
    notFound();
  }
  const { pkg, departures } = detail;

  return (
    <div>
      <Link href="/packages" className="text-sm text-forest hover:underline">
        ← all packages
      </Link>
      <p className="mt-4 text-xs tracking-survey text-mist">{pkg.country}</p>
      <h1 className="mt-1 text-3xl font-bold text-navy">{pkg.title}</h1>
      <p className="mt-3 max-w-2xl text-mist">{pkg.description}</p>
      {pkg.tags.length > 0 && (
        <p className="mt-2 text-xs uppercase tracking-survey text-forest">{pkg.tags.join(' · ')}</p>
      )}

      <div className="mt-8 border-t border-rule pt-6">
        <p className="text-xs tracking-survey text-mist">DEPARTURES</p>
        {departures.length === 0 ? (
          <p className="mt-2 text-mist">No departures scheduled right now.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {departures.map((d) => {
              const price = effectivePrice(pkg, d);
              const bookable = isBookable(pkg, d);
              return (
                <li key={d.id} className="flex items-center justify-between rounded-survey border border-rule p-4">
                  <div>
                    <p className="font-semibold text-navy">{d.startDate.toLocaleDateString()}</p>
                    <p className="text-sm text-mist">
                      {format(price)}/seat · capacity {d.capacity}
                    </p>
                  </div>
                  {bookable ? (
                    <Link href={`/book/${d.id}`} className="rounded-survey bg-amber px-4 py-2 text-sm font-semibold text-navy">
                      Book this departure
                    </Link>
                  ) : (
                    <span className="text-sm text-mist">Not open for booking</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { catalogService, effectivePrice, isBookable } from '@modules/catalog';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { formatOrPending } from '@lib/money';

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
      <p className="eyebrow mt-4 text-mist">{pkg.country}</p>
      <h1 className="mt-1 text-3xl font-bold text-navy">{pkg.title}</h1>
      <p className="mt-3 max-w-2xl text-mist">{pkg.description}</p>
      {pkg.tags.length > 0 && <p className="eyebrow mt-2 text-forest">{pkg.tags.join(' · ')}</p>}

      <div className="survey-rule mt-8" />
      <div className="pt-6">
        <p className="eyebrow text-mist">Departures</p>
        {departures.length === 0 ? (
          <p className="mt-2 text-mist">No departures scheduled right now.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {departures.map((d) => {
              const price = effectivePrice(pkg, d);
              const bookable = isBookable(pkg, d);
              return (
                <Card as="li" key={d.id} className="flex items-center justify-between">
                  <div>
                    <Badge tone={bookable ? 'success' : 'neutral'}>{bookable ? 'Available' : 'Unavailable'}</Badge>
                    <p className="mt-1 text-sm text-mist">
                      {formatOrPending(price?.minor ?? null, price?.currency ?? null)}/seat · capacity {d.capacity}
                    </p>
                  </div>
                  {bookable && <LinkButton href={`/book/${d.id}`}>Book this departure</LinkButton>}
                </Card>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

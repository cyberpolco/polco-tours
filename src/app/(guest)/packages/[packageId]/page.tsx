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
        <p className="eyebrow text-mist">Availability</p>
        {departures.length === 0 ? (
          <p className="mt-2 text-mist">No departures scheduled right now.</p>
        ) : (
          (() => {
            // Guests only ever see one bookable slot per package, never a
            // per-departure date -- departure dates are staff-only
            // information (visible in the staff dashboard). Prefer the
            // first departure that's actually open for booking; if none
            // are, fall back to the first one just to report "Unavailable".
            const featured = departures.find((d) => isBookable(pkg, d)) ?? departures[0];
            if (!featured) return null;
            const price = effectivePrice(pkg, featured);
            const bookable = isBookable(pkg, featured);
            return (
              <Card className="flex items-center justify-between">
                <div>
                  <Badge tone={bookable ? 'success' : 'neutral'}>{bookable ? 'Available' : 'Unavailable'}</Badge>
                  <p className="mt-1 text-sm text-mist">
                    {formatOrPending(price?.minor ?? null, price?.currency ?? null)}/seat · capacity {featured.capacity}
                  </p>
                </div>
                {bookable && <LinkButton href={`/book/${featured.id}`}>Book this departure</LinkButton>}
              </Card>
            );
          })()
        )}
      </div>
    </div>
  );
}

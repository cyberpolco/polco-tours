import Link from 'next/link';
import { notFound } from 'next/navigation';
import { catalogService } from '@modules/catalog';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { formatOrPending } from '@lib/money';

interface Props {
  params: Promise<{ packageId: string }>;
}

export default async function PackageDetailPage({ params }: Props) {
  const { packageId } = await params;

  let pkg;
  try {
    ({ pkg } = await catalogService.getPublicPackageWithDepartures(packageId));
  } catch {
    notFound();
  }

  // DR-054: a guest now picks their own travel dates instead of joining a
  // staff-pre-scheduled Departure (a fresh one is created just for their
  // booking, see catalogService.createDepartureForBooking) -- bookability is
  // a package-level question (published + priced), not "is there an open
  // slot right now".
  const bookable = pkg.status === 'PUBLISHED' && pkg.priceMinor != null;

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
        <Card className="flex items-center justify-between">
          <div>
            <Badge tone={bookable ? 'success' : 'neutral'}>{bookable ? 'Available' : 'Unavailable'}</Badge>
            <p className="mt-1 text-sm text-mist">
              {formatOrPending(pkg.priceMinor, pkg.currency)}/seat · choose your own travel dates
            </p>
          </div>
          {bookable && <LinkButton href={`/book-package/${pkg.id}`}>Book this trip</LinkButton>}
        </Card>
      </div>
    </div>
  );
}

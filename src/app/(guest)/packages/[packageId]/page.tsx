import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { catalogService } from '@modules/catalog';
import { Badge } from '@/components/ui/Badge';
import { BackLink } from '@/components/ui/BackLink';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { PackageImage } from '@/components/ui/PackageImage';
import { formatOrPending } from '@lib/money';

interface Props {
  params: Promise<{ packageId: string }>;
}

// Per-package title/description for a shared link's preview -- paired with
// this route's opengraph-image.tsx (the image half of the same preview).
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { packageId } = await params;
  try {
    const { pkg } = await catalogService.getPublicPackageWithDepartures(packageId);
    return { title: pkg.title, description: pkg.description };
  } catch {
    return {};
  }
}

export default async function PackageDetailPage({ params }: Props) {
  const { packageId } = await params;

  let pkg;
  try {
    ({ pkg } = await catalogService.getPublicPackageWithDepartures(packageId));
  } catch {
    notFound();
  }

  // DR-054 (revised same session): a guest now picks their own travel start
  // date instead of joining a staff-pre-scheduled Departure (a fresh one is
  // created just for their booking, see catalogService.createDepartureForBooking)
  // -- bookability is a package-level question (published-and-available +
  // priced + duration set), not "is there an open slot right now". Trip
  // length (durationDays) is staff-set at package creation, never a guest
  // choice. DR-117: a PUBLISHED_UNAVAILABLE package still renders this page
  // (isPackageVisible shows both sub-statuses) -- it's just never bookable,
  // same Available/Unavailable badge below doubling as the sub-status tell.
  const bookable = pkg.status === 'PUBLISHED_AVAILABLE' && pkg.priceMinor != null && pkg.durationDays != null;
  const t = await getTranslations('PackageDetail');
  const tCommon = await getTranslations('Common');
  const tCountries = await getTranslations('Countries');

  return (
    <div>
      <BackLink href="/packages">{t('allPackages')}</BackLink>
      <PackageImage imageUrl={pkg.imageUrl} alt={pkg.title} seed={pkg.id} className="mt-4 max-h-96" />
      {/* DR-114: a combo package shows every country it touches, not just
          the primary/billing one. */}
      <p className="eyebrow mt-4 text-mist">{pkg.countries.map((c) => tCountries(c)).join(' + ')}</p>
      <h1 className="mt-1 text-3xl font-bold text-navy">{pkg.title}</h1>
      <p className="mt-3 max-w-2xl text-mist">{pkg.description}</p>
      {pkg.tags.length > 0 && <p className="eyebrow mt-2 text-forest">{pkg.tags.join(' · ')}</p>}

      <div className="survey-rule mt-8" />
      <div className="pt-6">
        <p className="eyebrow text-mist">{t('availability')}</p>
        <Card className="flex items-center justify-between">
          <div>
            <Badge tone={bookable ? 'success' : 'neutral'}>{bookable ? tCommon('available') : tCommon('unavailable')}</Badge>
            <p className="mt-1 text-sm text-mist">
              {formatOrPending(pkg.priceMinor, pkg.currency)}
              {t('perSeat')}
              {pkg.durationDays != null && ` · ${t('dayTrip', { days: pkg.durationDays })}`} · {t('chooseOwnStartDate')}
            </p>
          </div>
          {bookable && <LinkButton href={`/book-package/${pkg.id}`}>{t('bookThisTrip')}</LinkButton>}
        </Card>
      </div>
    </div>
  );
}

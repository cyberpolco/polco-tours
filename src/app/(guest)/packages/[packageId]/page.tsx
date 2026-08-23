import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { catalogService } from '@modules/catalog';
import { Badge } from '@/components/ui/Badge';
import { BackLink } from '@/components/ui/BackLink';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { PackageSlideshow } from '@/components/ui/PackageSlideshow';
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

  const tTags = await getTranslations('TripTags');

  return (
    <div>
      <BackLink href="/packages">{t('allPackages')}</BackLink>

      {/* Full-bleed hero echoing the homepage carousel's own scrim
          language, instead of a plain photo with the title typed below it.
          DR-173: plays the same up-to-3-image autoplay slideshow as the
          package card, reversing DR-172's original "card-only" split, so
          the cycle continues rather than freezing on the cover image once a
          guest clicks through. */}
      <PackageSlideshow
        imageUrls={pkg.imageUrls}
        alt={pkg.title}
        seed={pkg.id}
        className="mt-4 !aspect-auto h-80 sm:h-[26rem]"
        sizes="100vw"
      >
        <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/35 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-9">
          <div className="flex flex-wrap gap-2">
            {/* DR-114: a combo package shows every country it touches, not
                just the primary/billing one. */}
            <span className="rounded-pill bg-bone px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-ink">
              {pkg.countries.map((c) => tCountries(c)).join(' + ')}
            </span>
            {pkg.durationDays != null && (
              <span className="rounded-pill border border-bone/40 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-bone">
                {t('dayTrip', { days: pkg.durationDays })}
              </span>
            )}
          </div>
          <h1 className="mt-4 max-w-2xl text-3xl font-bold leading-[1.02] text-bone sm:text-4xl">{pkg.title}</h1>
        </div>
      </PackageSlideshow>

      <p className="mt-6 max-w-2xl text-mist">{pkg.description}</p>
      {pkg.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {pkg.tags.map((tag) => (
            <span key={tag} className="rounded-pill bg-forest-soft px-2.5 py-0.5 text-xs font-semibold text-forest">
              {tTags(tag)}
            </span>
          ))}
        </div>
      )}

      <div className="survey-rule mt-8" />
      <div className="pt-6">
        <p className="eyebrow text-mist">{t('availability')}</p>
        <Card className="flex items-center justify-between">
          <div>
            <Badge tone={bookable ? 'success' : 'neutral'}>{bookable ? tCommon('available') : tCommon('unavailable')}</Badge>
            <p className="mt-2 text-2xl font-bold text-navy">
              {formatOrPending(pkg.priceMinor, pkg.currency)}
              <span className="text-sm font-medium text-mist">{t('perSeat')}</span>
            </p>
            <p className="mt-1 text-sm text-mist">
              {pkg.durationDays != null && `${t('dayTrip', { days: pkg.durationDays })} · `}
              {t('chooseOwnStartDate')}
            </p>
          </div>
          {bookable && <LinkButton href={`/book-package/${pkg.id}`}>{t('bookThisTrip')}</LinkButton>}
        </Card>
      </div>
    </div>
  );
}

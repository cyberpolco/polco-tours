import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { TourPackageView } from '@modules/catalog';
import { Card } from '@/components/ui/Card';
import { PackageCardSlideshow } from '@/components/ui/PackageCardSlideshow';
import { formatOrPending } from '@lib/money';

interface PackageCardProps {
  pkg: TourPackageView;
  /** 'div' when a caller (e.g. RevealGroup) already supplies the `<li>` a
   * card grid needs -- defaults to 'li' for every other caller, unchanged. */
  as?: 'li' | 'div';
}

// Was duplicated verbatim in packages/page.tsx and quiz/results/page.tsx --
// one definition now. DR-068: gained a hero image (real or illustrated
// fallback, see PackageImage) and hover elevation (Card's `interactive`) --
// previously a bare text card with no visual differentiation between packages.
// DR-172: that hero image is now up to 3 images (TourPackage.imageUrls),
// autoplay-cycled by PackageCardSlideshow -- collapses back to PackageImage's
// original single-image/gradient rendering for the common 0-or-1-image case.
export async function PackageCard({ pkg, as = 'li' }: PackageCardProps) {
  const t = await getTranslations('PackageCard');
  const tCountries = await getTranslations('Countries');
  const tTags = await getTranslations('TripTags');
  return (
    <Card as={as} interactive className="flex h-full flex-col overflow-hidden p-0">
      {/* DR-118: prefer the personalized slug for a nicer, stable public URL
          -- falls back to the raw id only for a pre-DR-118 package still
          awaiting its backfilled slug. */}
      <Link href={`/packages/${pkg.slug ?? pkg.id}`} className="flex h-full flex-col">
        <PackageCardSlideshow imageUrls={pkg.imageUrls} alt={pkg.title} seed={pkg.id} />
        {/* Every package card in a grid renders the same size regardless of
            how long its title/description happen to be: line-clamp bounds
            both from above, min-h reserves their space from below (a
            line-clamp alone only caps a long text's height -- it doesn't
            keep a short one from collapsing smaller), and "Read more" (true
            for every package, since the detail page always has more than
            this card) replaces relying on the reader noticing a truncated
            sentence. mt-auto pins price/CTA to the same bottom edge on every
            card whether or not this package has tags. */}
        <div className="flex min-h-[19rem] flex-1 flex-col p-4">
          <h2 className="line-clamp-2 min-h-[3rem] font-semibold text-navy transition-colors group-hover:text-amber">
            {pkg.title}
          </h2>
          <p className="mt-1 line-clamp-3 min-h-[3.75rem] text-sm text-mist">{pkg.description}</p>
          <span className="text-xs font-semibold text-amber">{t('readMore')}</span>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {/* DR-114: a combo package shows every country it touches, not
                just the primary/billing one. */}
            <span className="rounded-pill bg-mist/10 px-2.5 py-1 text-xs font-semibold text-mist">
              {pkg.countries.map((c) => tCountries(c)).join(' + ')}
            </span>
            <span className="rounded-pill bg-mist/10 px-2.5 py-1 text-xs font-semibold text-mist">
              {pkg.durationDays ? t('durationDays', { days: pkg.durationDays }) : t('durationVaries')}
            </span>
          </div>
          {pkg.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pkg.tags.map((tag) => (
                <span key={tag} className="rounded-pill bg-forest-soft px-2.5 py-0.5 text-xs font-semibold text-forest">
                  {tTags(tag)}
                </span>
              ))}
            </div>
          )}
          <p className="mt-auto pt-3 text-lg font-bold text-navy">
            {formatOrPending(pkg.priceMinor, pkg.currency)}
            <span className="text-xs font-medium text-mist">{t('perSeat')}</span>
          </p>
        </div>
      </Link>
    </Card>
  );
}

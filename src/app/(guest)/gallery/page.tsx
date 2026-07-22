import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { flagEmoji } from '@lib/country-codes';
import { DESTINATION_SITES } from '@lib/destination-sites';
import { PackageImage } from '@/components/ui/PackageImage';
import { Reveal } from '@/components/ui/Reveal';

const COUNTRY_NAMES: Record<string, string> = { NA: 'Namibia', CD: 'DR Congo', ZM: 'Zambia', ZW: 'Zimbabwe' };

// No destination/hotel/package photography is licensed yet (OI-12 in
// CLAUDE.md) -- rather than fabricate or scrape photos to fill a gallery,
// this reuses the same illustrated "Horizon" gradient plates PackageImage
// already shows for a package with no imageUrl, one per curated named site
// (DESTINATION_SITES, the same real place list plan-my-trip's "sites to
// visit" step uses). Swapping in real photography later is just passing a
// real imageUrl per site -- no markup change needed here.
export default async function GalleryPage() {
  const t = await getTranslations('Gallery');

  return (
    <Reveal>
      <div>
        <p className="eyebrow text-mist">{t('eyebrow')}</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">{t('title')}</h1>
        <p className="mt-1 max-w-2xl text-sm text-mist">{t('subhead')}</p>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {DESTINATION_SITES.map((site) => (
            <Link key={site.name} href={`/plan-my-trip?destination=${site.country}`} className="group">
              <PackageImage imageUrl={null} alt={site.name} seed={site.name} />
              <p className="mt-2 text-sm font-medium text-navy transition-colors duration-200 group-hover:text-amber">
                {site.name}
              </p>
              <p className="text-xs text-mist">
                {flagEmoji(site.country)} {COUNTRY_NAMES[site.country]}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </Reveal>
  );
}

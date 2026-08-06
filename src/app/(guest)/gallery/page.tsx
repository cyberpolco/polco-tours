import { getTranslations } from 'next-intl/server';
import { DESTINATION_SITES } from '@lib/destination-sites';
import { Reveal } from '@/components/ui/Reveal';
import { GalleryGrid } from './gallery-grid';

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
        <GalleryGrid sites={DESTINATION_SITES} planTripLabel={t('planTripCta')} closeLabel={t('close')} />
      </div>
    </Reveal>
  );
}

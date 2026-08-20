import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { cmsService, type CmsLocale } from '@modules/cms';
import { DESTINATION_SITES } from '@lib/destination-sites';
import { Reveal } from '@/components/ui/Reveal';
import { GalleryGrid } from './gallery-grid';

// Same direct-cookie-read convention as (guest)/about/page.tsx.
async function resolveLocale(): Promise<CmsLocale> {
  const store = await cookies();
  return store.get('locale')?.value === 'fr' ? 'fr' : 'en';
}

// No destination/hotel/package photography was licensed at all originally
// (OI-12 in CLAUDE.md) -- staff can now upload a real photo or video per
// curated named site (DESTINATION_SITES, the same real place list
// plan-my-trip's "sites to visit" step uses) from /staff/cms. A site with
// no staff-uploaded media yet still falls back to the same illustrated
// "Horizon" gradient plate PackageImage shows for a package with no
// imageUrl (GalleryGrid handles the per-site fallback).
export default async function GalleryPage() {
  const t = await getTranslations('Gallery');
  const locale = await resolveLocale();
  const [cms, mediaItems] = await Promise.all([
    cmsService.getPublicTextBlock('gallery', locale),
    cmsService.listPublicMediaItems('gallery'),
  ]);
  const mediaBySite = Object.fromEntries(mediaItems.map((item) => [item.slotKey, item]));

  return (
    <Reveal>
      <div>
        <p className="eyebrow text-mist">{cms?.eyebrow ?? t('eyebrow')}</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">{cms?.title ?? t('title')}</h1>
        <p className="mt-1 max-w-2xl text-sm text-mist">{cms?.body ?? t('subhead')}</p>
        <GalleryGrid sites={DESTINATION_SITES} mediaBySite={mediaBySite} closeLabel={t('close')} />
      </div>
    </Reveal>
  );
}
